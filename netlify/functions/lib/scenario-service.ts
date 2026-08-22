import { createHash, randomUUID } from 'node:crypto';
import {
  DEFAULT_MAX_COMPRESSED_BYTES,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  MAX_PAGE_SIZE,
  METADATA_SCHEMA_VERSION,
} from '../../../shared/constants.ts';
import { detectCompatibility } from '../../../shared/compatibility.ts';
import {
  scenarioListQuerySchema,
  submitRatingBodySchema,
  type ScenarioListQuery,
  type ScenarioListResponse,
  type SubmitRatingResponse,
} from '../../../shared/schemas/api.ts';
import type { ScenarioMetadata, ScenarioSubmission } from '../../../shared/schemas/metadata.ts';
import { validateScenarioPackage } from '../../../shared/validation/package-validator.ts';
import type { AuthenticatedCreator } from './auth.ts';
import type { ScenarioBlobStore } from './blob-store.ts';

const CAS_RETRIES = 4;

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function metadataIdFromKey(key: string): string | null {
  return key.match(/^meta\/(.+)\.json$/)?.[1] ?? null;
}

function submissionIdFromKey(key: string): string | null {
  return key.match(/^submissions\/scenarios\/(.+)\.json$/)?.[1] ?? null;
}

function matchesSearch(metadata: ScenarioMetadata, search: string): boolean {
  const needle = search.toLowerCase();
  return [metadata.title, metadata.description, metadata.authorDisplayName, ...metadata.tags].some(
    (value) => value.toLowerCase().includes(needle),
  );
}

function matchesTags(metadata: ScenarioMetadata, tags: string[]): boolean {
  const normalized = new Set(metadata.tags.map((tag) => tag.toLowerCase()));
  return tags.every((tag) => normalized.has(tag.toLowerCase()));
}

function sortScenarios(items: ScenarioMetadata[], sort: ScenarioListQuery['sort']) {
  return [...items].sort((a, b) => {
    if (sort === 'rating') {
      return b.averageRating - a.averageRating || b.ratingCount - a.ratingCount;
    }
    if (sort === 'downloads') return b.downloadCount - a.downloadCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function releaseId(id: string, revision: number): string {
  return `${id}:r${revision}`;
}

function requireModified(modified: boolean, message: string): void {
  if (!modified) throw new ServiceError(409, message);
}

export class ScenarioService {
  constructor(private readonly store: ScenarioBlobStore) {}

  private async requireNotDeleted(id: string): Promise<void> {
    if (await this.store.getDeletion(id)) {
      throw new ServiceError(410, 'Scenario was administratively deleted.');
    }
  }

  private async requireOwner(id: string, creator: AuthenticatedCreator) {
    await this.requireNotDeleted(id);
    const ownership = await this.store.getOwnership(id);
    if (!ownership) {
      throw new ServiceError(
        409,
        'This legacy scenario has no verified owner. Ask an administrator to assign ownership or publish it as a new fork.',
      );
    }
    if (ownership.ownerSub !== creator.sub) {
      throw new ServiceError(403, 'Only the verified creator can change this scenario.');
    }
    return ownership;
  }

  async listScenarios(rawQuery: Record<string, string | undefined>): Promise<ScenarioListResponse> {
    const parsed = scenarioListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid query parameters.',
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    const query = parsed.data;
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    const tagFilters = (query.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const allMetadata = await loadAllMetadata(this.store);
    let filtered = allMetadata.filter((item) => item.publicationStatus === 'published');
    if (query.search) filtered = filtered.filter((item) => matchesSearch(item, query.search!));
    if (query.difficulty) {
      filtered = filtered.filter((item) => item.difficulty === query.difficulty);
    }
    if (query.maxTonnage != null) {
      filtered = filtered.filter((item) => item.maximumTonnage <= query.maxTonnage!);
    }
    if (tagFilters.length) filtered = filtered.filter((item) => matchesTags(item, tagFilters));
    const sorted = sortScenarios(filtered, query.sort);
    const total = sorted.length;
    const start = (query.page - 1) * limit;
    return {
      items: sorted.slice(start, start + limit),
      page: query.page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getScenario(id: string): Promise<ScenarioMetadata | null> {
    if (await this.store.getDeletion(id)) return null;
    const metadata = await this.store.getMetadata(id);
    return metadata?.publicationStatus === 'published' ? metadata : null;
  }

  async getScenarioRelease(id: string, revision: number): Promise<ScenarioMetadata | null> {
    if (await this.store.getDeletion(id)) return null;
    const pointer = await this.store.getMetadata(id);
    const isActivated =
      pointer?.availableRevisions?.includes(revision) ||
      (pointer?.publishedRevision ?? pointer?.revision ?? 1) === revision;
    if (!pointer || !isActivated) return null;
    const release = await this.store.getRelease(id, revision);
    if (release) return release.metadata;
    const legacyRevision = pointer.publishedRevision ?? pointer.revision ?? 1;
    return legacyRevision === revision ? pointer : null;
  }

  async downloadScenario(id: string, revision?: number) {
    const metadata = revision
      ? await this.getScenarioRelease(id, revision)
      : await this.getScenario(id);
    if (!metadata) return null;
    const resolvedRevision = revision ?? metadata.publishedRevision ?? metadata.revision;
    const packageBytes = resolvedRevision
      ? ((await this.store.getRevisionPackage(id, resolvedRevision)) ??
        (await this.store.getPackage(id)))
      : await this.store.getPackage(id);
    if (!packageBytes || sha256Hex(packageBytes) !== metadata.checksumSha256) return null;
    void this.incrementDownloadCount(id, metadata.releaseId).catch((error) => {
      console.warn(`Scenario ${id} download counter update failed`, error);
    });
    return { metadata, packageBytes };
  }

  private async incrementDownloadCount(id: string, expectedReleaseId?: string): Promise<void> {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
      const current = await this.store.getMetadataVersioned(id);
      if (!current || current.value.releaseId !== expectedReleaseId) return;
      const result = await this.store.setMetadata(
        { ...current.value, downloadCount: current.value.downloadCount + 1 },
        { onlyIfMatch: current.etag },
      );
      if (result.modified) return;
    }
  }

  async uploadScenario(packageBytes: Uint8Array, creator: AuthenticatedCreator) {
    const validation = await validateScenarioPackage(packageBytes, {
      maxCompressedBytes: DEFAULT_MAX_COMPRESSED_BYTES,
      maxDecompressedBytes: DEFAULT_MAX_DECOMPRESSED_BYTES,
    });
    if (!validation.ok) {
      throw new ServiceError(400, 'Scenario package validation failed.', validation.errors);
    }
    const { manifest, map, thumbnail } = validation.contents;
    const id = randomUUID();
    const now = new Date().toISOString();
    const metadata: ScenarioMetadata = {
      metadataSchemaVersion: METADATA_SCHEMA_VERSION,
      id,
      title: manifest.title,
      description: manifest.description,
      authorDisplayName: manifest.author,
      gameVersion: manifest.gameVersion,
      scenarioFormatVersion: manifest.scenarioFormatVersion,
      difficulty: manifest.difficulty,
      recommendedTonnage: manifest.recommendedTonnage,
      maximumTonnage: manifest.maximumTonnage,
      estimatedPlayTimeMinutes: manifest.estimatedPlayTimeMinutes,
      tags: manifest.tags,
      mapDimensions: { width: map.width, height: map.height },
      averageRating: 0,
      ratingCount: 0,
      downloadCount: 0,
      packageFileSize: packageBytes.byteLength,
      checksumSha256: sha256Hex(packageBytes),
      createdAt: now,
      updatedAt: now,
      publicationStatus: 'draft',
      revision: 1,
      pendingRevision: 1,
      compatibility: detectCompatibility(manifest.gameVersion, manifest.scenarioFormatVersion),
    };
    requireModified(
      (await this.store.setRevisionPackage(id, 1, packageBytes)).modified,
      'Scenario identifier collision. Retry the upload.',
    );
    requireModified(
      (await this.store.setRevisionThumbnail(id, 1, thumbnail)).modified,
      'Scenario identifier collision. Retry the upload.',
    );
    requireModified(
      (
        await this.store.setOwnership(
          {
            schemaVersion: 1,
            contentType: 'scenario',
            contentId: id,
            ownerSub: creator.sub,
            ownerEmail: creator.email,
            createdAt: now,
            updatedAt: now,
          },
          { onlyIfNew: true },
        )
      ).modified,
      'Scenario identifier collision. Retry the upload.',
    );
    requireModified(
      (
        await this.store.setSubmission(
          { schemaVersion: 1, id, revision: 1, metadata, submittedAt: now },
          { onlyIfNew: true },
        )
      ).modified,
      'Scenario identifier collision. Retry the upload.',
    );
    await this.store.setRatings(id, { ratings: [] }, { onlyIfNew: true });
    return metadata;
  }

  async updateScenario(id: string, packageBytes: Uint8Array, creator: AuthenticatedCreator) {
    await this.requireOwner(id, creator);
    const [published, submission] = await Promise.all([
      this.store.getMetadata(id),
      this.store.getSubmissionVersioned(id),
    ]);
    if (submission?.value.activation) {
      throw new ServiceError(409, 'Scenario approval is being activated. Reload and retry.');
    }
    if (submission?.value.metadata.publicationStatus === 'draft') {
      throw new ServiceError(409, 'A scenario revision is already awaiting review.');
    }
    if (submission?.value.metadata.publicationStatus === 'published') {
      const activeRevision = published?.publishedRevision ?? published?.revision;
      if (
        activeRevision !== submission.value.revision &&
        !published?.availableRevisions?.includes(submission.value.revision)
      ) {
        throw new ServiceError(409, 'The previous approval is still being finalized. Retry later.');
      }
    }
    const existing = published ?? submission?.value.metadata;
    if (!existing) throw new ServiceError(404, 'Scenario not found.');
    const validation = await validateScenarioPackage(packageBytes, {
      maxCompressedBytes: DEFAULT_MAX_COMPRESSED_BYTES,
      maxDecompressedBytes: DEFAULT_MAX_DECOMPRESSED_BYTES,
    });
    if (!validation.ok) {
      throw new ServiceError(400, 'Scenario package validation failed.', validation.errors);
    }
    const { manifest, map, thumbnail } = validation.contents;
    const revision =
      Math.max(
        published?.publishedRevision ?? published?.revision ?? 0,
        submission?.value.revision ?? 0,
      ) + 1;
    const now = new Date().toISOString();
    const metadata: ScenarioMetadata = {
      ...existing,
      title: manifest.title,
      description: manifest.description,
      authorDisplayName: manifest.author,
      gameVersion: manifest.gameVersion,
      scenarioFormatVersion: manifest.scenarioFormatVersion,
      difficulty: manifest.difficulty,
      recommendedTonnage: manifest.recommendedTonnage,
      maximumTonnage: manifest.maximumTonnage,
      estimatedPlayTimeMinutes: manifest.estimatedPlayTimeMinutes,
      tags: manifest.tags,
      mapDimensions: { width: map.width, height: map.height },
      packageFileSize: packageBytes.byteLength,
      checksumSha256: sha256Hex(packageBytes),
      updatedAt: now,
      publicationStatus: 'draft',
      revision,
      publishedRevision: published?.publishedRevision ?? published?.revision,
      pendingRevision: revision,
      releaseId: undefined,
      compatibility: detectCompatibility(manifest.gameVersion, manifest.scenarioFormatVersion),
    };
    requireModified(
      (await this.store.setRevisionPackage(id, revision, packageBytes)).modified,
      'A concurrent scenario update already claimed this revision.',
    );
    requireModified(
      (await this.store.setRevisionThumbnail(id, revision, thumbnail)).modified,
      'A concurrent scenario update already claimed this revision.',
    );
    const next: ScenarioSubmission = {
      schemaVersion: 1,
      id,
      revision,
      metadata,
      submittedAt: now,
    };
    const result = await this.store.setSubmission(
      next,
      submission ? { onlyIfMatch: submission.etag } : { onlyIfNew: true },
    );
    requireModified(result.modified, 'The scenario changed concurrently. Reload and retry.');
    return metadata;
  }

  async getThumbnail(id: string, revision?: number) {
    const metadata = revision
      ? await this.getScenarioRelease(id, revision)
      : await this.getScenario(id);
    if (!metadata) return null;
    const resolvedRevision = revision ?? metadata.publishedRevision ?? metadata.revision;
    return resolvedRevision
      ? ((await this.store.getRevisionThumbnail(id, resolvedRevision)) ??
          this.store.getThumbnail(id))
      : this.store.getThumbnail(id);
  }

  async submitRating(id: string, body: unknown): Promise<SubmitRatingResponse> {
    const parsed = submitRatingBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid rating payload.',
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    const metadata = await this.getScenario(id);
    if (!metadata) throw new ServiceError(404, 'Scenario not found.');
    const { clientId, rating } = parsed.data;
    for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
      const current = await this.store.getRatingsVersioned(id);
      const ratings = current?.value ?? { ratings: [] };
      const updatedAt = new Date().toISOString();
      const existingIndex = ratings.ratings.findIndex((entry) => entry.clientId === clientId);
      if (existingIndex >= 0) ratings.ratings[existingIndex] = { clientId, rating, updatedAt };
      else ratings.ratings.push({ clientId, rating, updatedAt });
      const write = await this.store.setRatings(
        id,
        ratings,
        current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
      );
      if (!write.modified) continue;
      const averageRating =
        ratings.ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.ratings.length;
      const rounded = Math.round(averageRating * 100) / 100;
      const currentMetadata = await this.store.getMetadataVersioned(id);
      if (currentMetadata) {
        await this.store.setMetadata(
          {
            ...currentMetadata.value,
            averageRating: rounded,
            ratingCount: ratings.ratings.length,
          },
          { onlyIfMatch: currentMetadata.etag },
        );
      }
      return { averageRating: rounded, ratingCount: ratings.ratings.length, yourRating: rating };
    }
    throw new ServiceError(409, 'Rating changed concurrently. Retry.');
  }

  async getSubmissionStatus(id: string, creator: AuthenticatedCreator) {
    await this.requireOwner(id, creator);
    const [submission, published] = await Promise.all([
      this.store.getSubmission(id),
      this.store.getMetadata(id),
    ]);
    const metadata = submission?.metadata ?? published;
    if (!metadata) return null;
    return {
      id,
      publicationStatus: metadata.publicationStatus,
      revision: submission?.revision ?? metadata.revision ?? 1,
      publishedRevision: published?.publishedRevision ?? published?.revision,
      rejection: submission?.rejection,
    };
  }

  async listPendingScenarios(): Promise<ScenarioMetadata[]> {
    const keys = await this.store.listSubmissionKeys();
    const submissions = await Promise.all(
      keys.map((key) => {
        const id = submissionIdFromKey(key);
        return id ? this.store.getSubmission(id) : null;
      }),
    );
    const modern = submissions
      .filter((entry) => entry?.metadata.publicationStatus === 'draft')
      .map((entry) => entry!.metadata);
    const legacy = (await loadAllMetadata(this.store)).filter(
      (item) => item.publicationStatus === 'draft' && !modern.some((entry) => entry.id === item.id),
    );
    return [...modern, ...legacy].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async getScenarioAdmin(id: string) {
    if (await this.store.getDeletion(id)) return null;
    return (await this.store.getSubmission(id))?.metadata ?? this.store.getMetadata(id);
  }

  async getThumbnailAdmin(id: string) {
    const submission = await this.store.getSubmission(id);
    return submission
      ? this.store.getRevisionThumbnail(id, submission.revision)
      : this.store.getThumbnail(id);
  }

  async approveScenario(id: string, expectedRevision: number, moderator: AuthenticatedCreator) {
    await this.requireNotDeleted(id);
    const submission = await this.store.getSubmissionVersioned(id);
    if (!submission || submission.value.revision !== expectedRevision) {
      throw new ServiceError(409, 'The moderation command targets a stale scenario revision.');
    }
    if (!['draft', 'published'].includes(submission.value.metadata.publicationStatus)) {
      throw new ServiceError(409, 'This scenario revision is no longer pending approval.');
    }
    const [packageBytes, thumbnail] = await Promise.all([
      this.store.getRevisionPackage(id, expectedRevision),
      this.store.getRevisionThumbnail(id, expectedRevision),
    ]);
    if (!packageBytes || !thumbnail) {
      throw new ServiceError(409, 'Pending revision assets are incomplete.');
    }
    if (sha256Hex(packageBytes) !== submission.value.metadata.checksumSha256) {
      throw new ServiceError(409, 'Pending revision checksum verification failed.');
    }
    const now = new Date().toISOString();
    const idForRelease = releaseId(id, expectedRevision);
    const availableRevisions = [
      ...new Set([
        ...((await this.store.getMetadata(id))?.availableRevisions ?? []),
        expectedRevision,
      ]),
    ].sort((a, b) => a - b);
    let metadata: ScenarioMetadata = {
      ...submission.value.metadata,
      publicationStatus: 'published',
      revision: expectedRevision,
      publishedRevision: expectedRevision,
      pendingRevision: undefined,
      releaseId: idForRelease,
      availableRevisions,
      updatedAt: now,
    };
    const release = {
      schemaVersion: 1 as const,
      releaseId: idForRelease,
      id,
      revision: expectedRevision,
      metadata,
      approvedAt: now,
      approvedBySub: moderator.sub,
    };
    const releaseWrite = await this.store.setRelease(release);
    if (!releaseWrite.modified) {
      const existingRelease = await this.store.getRelease(id, expectedRevision);
      if (existingRelease?.metadata.checksumSha256 !== metadata.checksumSha256) {
        throw new ServiceError(409, 'This immutable release already contains different bytes.');
      }
      if (!existingRelease) throw new ServiceError(409, 'Immutable release creation conflicted.');
      metadata = existingRelease.metadata;
    }
    let activatedSubmission = submission;
    if (submission.value.metadata.publicationStatus === 'draft') {
      if (submission.value.activation?.revision !== expectedRevision) {
        const activationWrite = await this.store.setSubmission(
          {
            ...submission.value,
            activation: {
              command: 'approve',
              revision: expectedRevision,
              moderatorSub: moderator.sub,
              startedAt: now,
            },
          },
          { onlyIfMatch: submission.etag },
        );
        requireModified(activationWrite.modified, 'The scenario was moderated concurrently.');
        const locked = await this.store.getSubmissionVersioned(id);
        if (!locked?.value.activation || locked.value.activation.revision !== expectedRevision) {
          throw new ServiceError(409, 'Scenario approval activation could not be verified.');
        }
        activatedSubmission = locked;
      }
    }
    await this.store.setPackage(id, packageBytes);
    await this.store.setThumbnail(id, thumbnail);
    const current = await this.store.getMetadataVersioned(id);
    const pointerWrite = await this.store.setMetadata(
      metadata,
      current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    requireModified(pointerWrite.modified, 'The scenario changed before public activation.');
    if (activatedSubmission.value.metadata.publicationStatus === 'draft') {
      const statusWrite = await this.store.setSubmission(
        { ...activatedSubmission.value, metadata, activation: undefined, rejection: undefined },
        { onlyIfMatch: activatedSubmission.etag },
      );
      if (!statusWrite.modified) {
        const completed = await this.store.getSubmission(id);
        if (
          completed?.revision !== expectedRevision ||
          completed.metadata.publicationStatus !== 'published'
        ) {
          throw new ServiceError(409, 'Scenario approval finalization conflicted. Retry.');
        }
      }
    }
    return metadata;
  }

  async rejectScenario(
    id: string,
    expectedRevision: number,
    reason: string,
    moderator: AuthenticatedCreator,
  ) {
    const boundedReason = reason.trim();
    if (!boundedReason || boundedReason.length > 1000) {
      throw new ServiceError(400, 'Rejection reason must contain 1 to 1000 characters.');
    }
    const submission = await this.store.getSubmissionVersioned(id);
    if (
      !submission ||
      submission.value.revision !== expectedRevision ||
      submission.value.metadata.publicationStatus !== 'draft' ||
      !!submission.value.activation
    ) {
      throw new ServiceError(409, 'The moderation command targets a stale scenario revision.');
    }
    const moderatedAt = new Date().toISOString();
    const metadata = {
      ...submission.value.metadata,
      publicationStatus: 'archived' as const,
      updatedAt: moderatedAt,
    };
    const result = await this.store.setSubmission(
      {
        ...submission.value,
        metadata,
        rejection: { reason: boundedReason, moderatorSub: moderator.sub, moderatedAt },
      },
      { onlyIfMatch: submission.etag },
    );
    requireModified(result.modified, 'The scenario was moderated concurrently.');
    return metadata;
  }

  async rollbackScenario(id: string, revision: number, moderator: AuthenticatedCreator) {
    await this.requireNotDeleted(id);
    const [release, packageBytes, thumbnail, current] = await Promise.all([
      this.store.getRelease(id, revision),
      this.store.getRevisionPackage(id, revision),
      this.store.getRevisionThumbnail(id, revision),
      this.store.getMetadataVersioned(id),
    ]);
    if (!release || !packageBytes || !thumbnail) {
      throw new ServiceError(404, 'Scenario release not found.');
    }
    if (sha256Hex(packageBytes) !== release.metadata.checksumSha256) {
      throw new ServiceError(409, 'Immutable scenario release checksum verification failed.');
    }
    const metadata: ScenarioMetadata = {
      ...release.metadata,
      publicationStatus: 'published',
      revision,
      publishedRevision: revision,
      pendingRevision: undefined,
      releaseId: release.releaseId,
      availableRevisions: [
        ...new Set([...(current?.value.availableRevisions ?? []), revision]),
      ].sort((a, b) => a - b),
      updatedAt: new Date().toISOString(),
    };
    await this.store.setPackage(id, packageBytes);
    await this.store.setThumbnail(id, thumbnail);
    requireModified(
      (
        await this.store.setMetadata(
          metadata,
          current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
        )
      ).modified,
      `The scenario changed before rollback by ${moderator.sub} could activate.`,
    );
    return metadata;
  }

  async withdrawScenario(id: string, creator: AuthenticatedCreator) {
    await this.requireOwner(id, creator);
    const [submission, published] = await Promise.all([
      this.store.getSubmissionVersioned(id),
      this.store.getMetadataVersioned(id),
    ]);
    if (!submission && !published) throw new ServiceError(404, 'Scenario not found.');
    if (submission?.value.activation) {
      throw new ServiceError(409, 'Scenario approval is being activated. Reload and retry.');
    }
    const updatedAt = new Date().toISOString();
    const publishedMetadata = published
      ? { ...published.value, publicationStatus: 'archived' as const, updatedAt }
      : undefined;
    const submissionMetadata = submission
      ? { ...submission.value.metadata, publicationStatus: 'archived' as const, updatedAt }
      : undefined;
    if (published) {
      requireModified(
        (await this.store.setMetadata(publishedMetadata!, { onlyIfMatch: published.etag }))
          .modified,
        'The scenario changed concurrently. Reload and retry.',
      );
    }
    if (submission) {
      requireModified(
        (
          await this.store.setSubmission(
            { ...submission.value, metadata: submissionMetadata! },
            { onlyIfMatch: submission.etag },
          )
        ).modified,
        'The scenario changed concurrently. Reload and retry.',
      );
    }
    return submissionMetadata ?? publishedMetadata!;
  }

  async assignScenarioOwner(id: string, creator: AuthenticatedCreator): Promise<void> {
    await this.requireNotDeleted(id);
    const [metadata, submission, existing] = await Promise.all([
      this.store.getMetadata(id),
      this.store.getSubmission(id),
      this.store.getOwnership(id),
    ]);
    if (!metadata && !submission) throw new ServiceError(404, 'Scenario not found.');
    if (existing && existing.ownerSub !== creator.sub) {
      throw new ServiceError(409, 'Scenario ownership is already assigned.');
    }
    if (existing) return;
    const now = new Date().toISOString();
    requireModified(
      (
        await this.store.setOwnership(
          {
            schemaVersion: 1,
            contentType: 'scenario',
            contentId: id,
            ownerSub: creator.sub,
            ownerEmail: creator.email,
            createdAt: now,
            updatedAt: now,
          },
          { onlyIfNew: true },
        )
      ).modified,
      'Scenario ownership was assigned concurrently.',
    );
  }

  async deleteScenario(id: string, moderator: AuthenticatedCreator): Promise<void> {
    const [metadata, submission] = await Promise.all([
      this.store.getMetadata(id),
      this.store.getSubmission(id),
    ]);
    if (!metadata && !submission && !(await this.store.getDeletion(id))) {
      throw new ServiceError(404, 'Scenario not found.');
    }
    const deletion = {
      schemaVersion: 1 as const,
      contentType: 'scenario' as const,
      contentId: id,
      deletedAt: new Date().toISOString(),
      deletedBySub: moderator.sub,
      retainedImmutableRevisions: true as const,
    };
    const result = await this.store.setDeletion(deletion);
    if (!result.modified && !(await this.store.getDeletion(id))) {
      throw new ServiceError(409, 'Scenario deletion conflicted. Retry.');
    }
    await this.store.deleteMutableScenario(id);
  }
}

export class ServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export async function loadAllMetadata(store: ScenarioBlobStore): Promise<ScenarioMetadata[]> {
  const keys = await store.listMetadataKeys();
  const items: ScenarioMetadata[] = [];
  for (const key of keys) {
    const id = metadataIdFromKey(key);
    if (!id || (await store.getDeletion(id))) continue;
    const metadata = await store.getMetadata(id);
    if (metadata) items.push(metadata);
  }
  return items;
}
