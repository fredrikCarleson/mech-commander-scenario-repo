import { createHash, randomUUID } from 'node:crypto';
import {
  DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES,
  DEFAULT_MAX_CAMPAIGN_DECOMPRESSED_BYTES,
  MAX_PAGE_SIZE,
  METADATA_SCHEMA_VERSION,
  SUPPORTED_CAMPAIGN_FORMAT_VERSIONS,
  SUPPORTED_GAME_VERSIONS,
} from '../../../shared/constants.ts';
import { submitRatingBodySchema, type SubmitRatingResponse } from '../../../shared/schemas/api.ts';
import type { CampaignMetadata, CampaignSubmission } from '../../../shared/schemas/campaign.ts';
import { validateCampaignPackage } from '../../../shared/validation/campaign-package-validator.ts';
import type { AuthenticatedCreator } from './auth.ts';
import type { CampaignBlobStore } from './campaign-blob-store.ts';
import { ServiceError } from './scenario-service.ts';

type CampaignSort = 'newest' | 'rating' | 'downloads';
const CAS_RETRIES = 4;

export interface CampaignListResponse {
  items: CampaignMetadata[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function metadataIdFromKey(key: string): string | null {
  return key.match(/^campaigns\/meta\/(.+)\.json$/)?.[1] ?? null;
}

function submissionIdFromKey(key: string): string | null {
  return key.match(/^submissions\/campaigns\/(.+)\.json$/)?.[1] ?? null;
}

function integerQuery(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ServiceError(400, 'Pagination values must be positive integers.');
  }
  return parsed;
}

function detectCampaignCompatibility(gameVersion: string, campaignFormatVersion: string) {
  const gameVersionSupported = (SUPPORTED_GAME_VERSIONS as readonly string[]).includes(gameVersion);
  const campaignFormatSupported = (
    SUPPORTED_CAMPAIGN_FORMAT_VERSIONS as readonly string[]
  ).includes(campaignFormatVersion);
  const warnings: string[] = [];
  if (!gameVersionSupported) warnings.push(`Game version ${gameVersion} is not supported.`);
  if (!campaignFormatSupported) {
    warnings.push(`Campaign format ${campaignFormatVersion} is not supported.`);
  }
  return { gameVersionSupported, campaignFormatSupported, warnings };
}

function sortCampaigns(items: CampaignMetadata[], sort: CampaignSort) {
  return [...items].sort((a, b) => {
    if (sort === 'rating') {
      return b.averageRating - a.averageRating || b.ratingCount - a.ratingCount;
    }
    if (sort === 'downloads') return b.downloadCount - a.downloadCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireModified(modified: boolean, message: string): void {
  if (!modified) throw new ServiceError(409, message);
}

function releaseId(id: string, revision: number): string {
  return `${id}:r${revision}`;
}

export class CampaignService {
  constructor(private readonly store: CampaignBlobStore) {}

  private async requireNotDeleted(id: string): Promise<void> {
    if (await this.store.getDeletion(id)) {
      throw new ServiceError(410, 'Campaign was administratively deleted.');
    }
  }

  private async requireOwner(id: string, creator: AuthenticatedCreator) {
    await this.requireNotDeleted(id);
    const ownership = await this.store.getOwnership(id);
    if (!ownership) {
      throw new ServiceError(
        409,
        'This legacy campaign has no verified owner. Ask an administrator to assign ownership or publish it as a new fork.',
      );
    }
    if (ownership.ownerSub !== creator.sub) {
      throw new ServiceError(403, 'Only the verified creator can change this campaign.');
    }
    return ownership;
  }

  private async loadMetadata() {
    const keys = await this.store.listMetadataKeys();
    const items = await Promise.all(
      keys.map(async (key) => {
        const id = metadataIdFromKey(key);
        return id && !(await this.store.getDeletion(id)) ? this.store.getMetadata(id) : null;
      }),
    );
    return items.filter((item): item is CampaignMetadata => item !== null);
  }

  private async loadSubmissions() {
    const keys = await this.store.listSubmissionKeys();
    const items = await Promise.all(
      keys.map((key) => {
        const id = submissionIdFromKey(key);
        return id ? this.store.getSubmission(id) : null;
      }),
    );
    return items.filter((item): item is CampaignSubmission => item !== null);
  }

  async listCampaigns(query: Record<string, string | undefined>): Promise<CampaignListResponse> {
    const page = integerQuery(query.page, 1);
    const limit = Math.min(integerQuery(query.limit, 20), MAX_PAGE_SIZE);
    const sort: CampaignSort =
      query.sort === 'rating' || query.sort === 'downloads' ? query.sort : 'newest';
    const search = query.search?.trim().toLowerCase();
    const tags = (query.tags ?? '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    let items = (await this.loadMetadata()).filter(
      (item) => item.publicationStatus === 'published',
    );
    if (search) {
      items = items.filter((item) =>
        [item.title, item.tagline, item.authorDisplayName, ...item.tags].some((value) =>
          value.toLowerCase().includes(search),
        ),
      );
    }
    if (query.difficulty) items = items.filter((item) => item.difficulty === query.difficulty);
    if (tags.length) {
      items = items.filter((item) => {
        const itemTags = new Set(item.tags.map((tag) => tag.toLowerCase()));
        return tags.every((tag) => itemTags.has(tag));
      });
    }
    const sorted = sortCampaigns(items, sort);
    const total = sorted.length;
    const start = (page - 1) * limit;
    return {
      items: sorted.slice(start, start + limit),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getCampaign(id: string) {
    if (await this.store.getDeletion(id)) return null;
    const metadata = await this.store.getMetadata(id);
    return metadata?.publicationStatus === 'published' ? metadata : null;
  }

  async getCampaignRelease(id: string, revision: number) {
    if (await this.store.getDeletion(id)) return null;
    const pointer = await this.store.getMetadata(id);
    const isActivated =
      pointer?.availableRevisions?.includes(revision) ||
      (pointer?.publishedRevision ?? pointer?.revision) === revision;
    if (!pointer || !isActivated) return null;
    const release = await this.store.getRelease(id, revision);
    if (release) return release.metadata;
    const legacyRevision = pointer.publishedRevision ?? pointer.revision;
    return legacyRevision === revision ? pointer : null;
  }

  private async validate(packageBytes: Uint8Array) {
    const result = await validateCampaignPackage(packageBytes, {
      maxCompressedBytes: DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES,
      maxDecompressedBytes: DEFAULT_MAX_CAMPAIGN_DECOMPRESSED_BYTES,
    });
    if (!result.ok) {
      throw new ServiceError(400, 'Campaign package validation failed.', result.errors);
    }
    return result.contents;
  }

  async uploadCampaign(packageBytes: Uint8Array, creator: AuthenticatedCreator) {
    const validation = await this.validate(packageBytes);
    const { manifest, thumbnail, orderedMissionIds } = validation;
    let id = randomUUID();
    const checksum = sha256Hex(packageBytes);
    const now = new Date().toISOString();
    const claim = {
      schemaVersion: 1 as const,
      stableCampaignId: manifest.stableCampaignId,
      repositoryId: id,
      ownerSub: creator.sub,
      initialChecksumSha256: checksum,
      claimedAt: now,
      state: 'active' as const,
    };
    const claimWrite = await this.store.setStableIdClaim(claim, { onlyIfNew: true });
    if (!claimWrite.modified) {
      const existingClaim = await this.store.getStableIdClaim(manifest.stableCampaignId);
      if (
        existingClaim?.ownerSub === creator.sub &&
        existingClaim.initialChecksumSha256 === checksum
      ) {
        const retry = await this.store.getSubmission(existingClaim.repositoryId);
        if (retry) return retry.metadata;
        id = existingClaim.repositoryId;
      } else {
        throw new ServiceError(409, 'A campaign with this stable ID is already claimed.');
      }
    }
    const metadata: CampaignMetadata = {
      metadataSchemaVersion: METADATA_SCHEMA_VERSION,
      id,
      stableCampaignId: manifest.stableCampaignId,
      title: manifest.title,
      tagline: manifest.tagline,
      authorDisplayName: manifest.author,
      gameVersion: manifest.gameVersion,
      campaignFormatVersion: manifest.campaignFormatVersion,
      difficulty: manifest.difficulty,
      missionCount: manifest.missionCount,
      estimatedPlayTimeMinutes: manifest.estimatedPlayTimeMinutes,
      tags: manifest.tags,
      averageRating: 0,
      ratingCount: 0,
      downloadCount: 0,
      packageFileSize: packageBytes.byteLength,
      checksumSha256: checksum,
      createdAt: now,
      updatedAt: now,
      publicationStatus: 'draft',
      revision: 1,
      pendingRevision: 1,
      compatibility: detectCampaignCompatibility(
        manifest.gameVersion,
        manifest.campaignFormatVersion,
      ),
    };
    const packageWrite = await this.store.setRevisionPackage(id, 1, packageBytes);
    if (!packageWrite.modified) {
      const existing = await this.store.getRevisionPackage(id, 1);
      if (!existing || sha256Hex(existing) !== checksum) {
        throw new ServiceError(409, 'Campaign retry found different immutable package bytes.');
      }
    }
    const thumbnailWrite = await this.store.setRevisionThumbnail(id, 1, thumbnail);
    if (!thumbnailWrite.modified) {
      const existing = await this.store.getRevisionThumbnail(id, 1);
      if (!existing || !arraysEqual([...existing], [...thumbnail])) {
        throw new ServiceError(409, 'Campaign retry found different immutable thumbnail bytes.');
      }
    }
    const ownershipWrite = await this.store.setOwnership(
      {
        schemaVersion: 1,
        contentType: 'campaign',
        contentId: id,
        ownerSub: creator.sub,
        ownerEmail: creator.email,
        createdAt: now,
        updatedAt: now,
      },
      { onlyIfNew: true },
    );
    if (!ownershipWrite.modified) {
      const existing = await this.store.getOwnership(id);
      if (existing?.ownerSub !== creator.sub) {
        throw new ServiceError(409, 'Campaign retry found different ownership.');
      }
    }
    const submissionWrite = await this.store.setSubmission(
      {
        schemaVersion: 1,
        id,
        revision: 1,
        metadata,
        submittedAt: now,
        orderedMissionIds,
      },
      { onlyIfNew: true },
    );
    if (!submissionWrite.modified) {
      const existing = await this.store.getSubmission(id);
      if (existing?.revision !== 1 || existing.metadata.checksumSha256 !== checksum) {
        throw new ServiceError(409, 'Campaign retry found a different submission.');
      }
      return existing.metadata;
    }
    await this.store.setRatings(id, { ratings: [] }, { onlyIfNew: true });
    return metadata;
  }

  async updateCampaign(id: string, packageBytes: Uint8Array, creator: AuthenticatedCreator) {
    await this.requireOwner(id, creator);
    const [published, submission] = await Promise.all([
      this.store.getMetadata(id),
      this.store.getSubmissionVersioned(id),
    ]);
    if (submission?.value.activation) {
      throw new ServiceError(409, 'Campaign approval is being activated. Reload and retry.');
    }
    if (submission?.value.metadata.publicationStatus === 'draft') {
      throw new ServiceError(409, 'A campaign revision is already awaiting review.');
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
    if (!existing) throw new ServiceError(404, 'Campaign not found.');
    const { manifest, thumbnail, orderedMissionIds } = await this.validate(packageBytes);
    if (manifest.stableCampaignId !== existing.stableCampaignId) {
      throw new ServiceError(409, 'A campaign stable ID cannot be changed.');
    }
    let compatibleMissionIds = submission?.value.orderedMissionIds;
    if (published) {
      const publishedRevision = published.publishedRevision ?? published.revision;
      compatibleMissionIds = (await this.store.getRelease(id, publishedRevision))
        ?.orderedMissionIds;
    }
    if (compatibleMissionIds && !arraysEqual(compatibleMissionIds, orderedMissionIds)) {
      throw new ServiceError(
        409,
        'Mission IDs and order must remain unchanged for updates. Publish this package as a new campaign fork.',
      );
    }
    const revision =
      Math.max(
        published?.publishedRevision ?? published?.revision ?? 0,
        submission?.value.revision ?? 0,
      ) + 1;
    const now = new Date().toISOString();
    const metadata: CampaignMetadata = {
      ...existing,
      title: manifest.title,
      tagline: manifest.tagline,
      authorDisplayName: manifest.author,
      gameVersion: manifest.gameVersion,
      campaignFormatVersion: manifest.campaignFormatVersion,
      difficulty: manifest.difficulty,
      missionCount: manifest.missionCount,
      estimatedPlayTimeMinutes: manifest.estimatedPlayTimeMinutes,
      tags: manifest.tags,
      packageFileSize: packageBytes.byteLength,
      checksumSha256: sha256Hex(packageBytes),
      updatedAt: now,
      publicationStatus: 'draft',
      revision,
      publishedRevision: published?.publishedRevision ?? published?.revision,
      pendingRevision: revision,
      releaseId: undefined,
      compatibility: detectCampaignCompatibility(
        manifest.gameVersion,
        manifest.campaignFormatVersion,
      ),
    };
    requireModified(
      (await this.store.setRevisionPackage(id, revision, packageBytes)).modified,
      'A concurrent campaign update already claimed this revision.',
    );
    requireModified(
      (await this.store.setRevisionThumbnail(id, revision, thumbnail)).modified,
      'A concurrent campaign update already claimed this revision.',
    );
    const next: CampaignSubmission = {
      schemaVersion: 1,
      id,
      revision,
      metadata,
      submittedAt: now,
      orderedMissionIds,
    };
    const result = await this.store.setSubmission(
      next,
      submission ? { onlyIfMatch: submission.etag } : { onlyIfNew: true },
    );
    requireModified(result.modified, 'The campaign changed concurrently. Reload and retry.');
    const claim = await this.store.getStableIdClaimVersioned(existing.stableCampaignId);
    if (claim?.value.state === 'withdrawn') {
      await this.store.setStableIdClaim(
        { ...claim.value, state: 'active' },
        { onlyIfMatch: claim.etag },
      );
    }
    return metadata;
  }

  async downloadCampaign(id: string, revision?: number) {
    const metadata = revision
      ? await this.getCampaignRelease(id, revision)
      : await this.getCampaign(id);
    if (!metadata) return null;
    const resolvedRevision = revision ?? metadata.publishedRevision ?? metadata.revision;
    const packageBytes =
      (await this.store.getRevisionPackage(id, resolvedRevision)) ??
      (await this.store.getPackage(id));
    if (!packageBytes || sha256Hex(packageBytes) !== metadata.checksumSha256) return null;
    void this.incrementDownloadCount(id, metadata.releaseId).catch((error) => {
      console.warn(`Campaign ${id} download counter update failed`, error);
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

  async getThumbnail(id: string, revision?: number) {
    const metadata = revision
      ? await this.getCampaignRelease(id, revision)
      : await this.getCampaign(id);
    if (!metadata) return null;
    const resolvedRevision = revision ?? metadata.publishedRevision ?? metadata.revision;
    return (
      (await this.store.getRevisionThumbnail(id, resolvedRevision)) ?? this.store.getThumbnail(id)
    );
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
    if (!(await this.getCampaign(id))) throw new ServiceError(404, 'Campaign not found.');
    const { clientId, rating } = parsed.data;
    for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
      const current = await this.store.getRatingsVersioned(id);
      const ratings = current?.value ?? { ratings: [] };
      const updatedAt = new Date().toISOString();
      const existing = ratings.ratings.findIndex((entry) => entry.clientId === clientId);
      if (existing >= 0) ratings.ratings[existing] = { clientId, rating, updatedAt };
      else ratings.ratings.push({ clientId, rating, updatedAt });
      const write = await this.store.setRatings(
        id,
        ratings,
        current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
      );
      if (!write.modified) continue;
      const average =
        ratings.ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.ratings.length;
      const rounded = Math.round(average * 100) / 100;
      const currentMetadata = await this.store.getMetadataVersioned(id);
      if (currentMetadata) {
        await this.store.setMetadata(
          { ...currentMetadata.value, averageRating: rounded, ratingCount: ratings.ratings.length },
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
      revision: submission?.revision ?? metadata.revision,
      publishedRevision: published?.publishedRevision ?? published?.revision,
      rejection: submission?.rejection,
    };
  }

  async listPendingCampaigns() {
    return (await this.loadSubmissions())
      .filter((item) => item.metadata.publicationStatus === 'draft')
      .map((item) => item.metadata)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getCampaignAdmin(id: string) {
    if (await this.store.getDeletion(id)) return null;
    return (await this.store.getSubmission(id))?.metadata ?? this.store.getMetadata(id);
  }

  async getThumbnailAdmin(id: string) {
    const submission = await this.store.getSubmission(id);
    return submission
      ? this.store.getRevisionThumbnail(id, submission.revision)
      : this.store.getThumbnail(id);
  }

  async approveCampaign(id: string, expectedRevision: number, moderator: AuthenticatedCreator) {
    await this.requireNotDeleted(id);
    const submission = await this.store.getSubmissionVersioned(id);
    if (!submission || submission.value.revision !== expectedRevision) {
      throw new ServiceError(409, 'The moderation command targets a stale campaign revision.');
    }
    if (!['draft', 'published'].includes(submission.value.metadata.publicationStatus)) {
      throw new ServiceError(409, 'This campaign revision is no longer pending approval.');
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
    const prior = await this.store.getMetadata(id);
    const availableRevisions = [
      ...new Set([...(prior?.availableRevisions ?? []), expectedRevision]),
    ].sort((a, b) => a - b);
    let metadata: CampaignMetadata = {
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
      stableCampaignId: metadata.stableCampaignId,
      revision: expectedRevision,
      orderedMissionIds: submission.value.orderedMissionIds,
      metadata,
      approvedAt: now,
      approvedBySub: moderator.sub,
    };
    const releaseWrite = await this.store.setRelease(release);
    if (!releaseWrite.modified) {
      const existing = await this.store.getRelease(id, expectedRevision);
      if (existing?.metadata.checksumSha256 !== metadata.checksumSha256) {
        throw new ServiceError(409, 'This immutable release already contains different bytes.');
      }
      if (!existing) throw new ServiceError(409, 'Immutable release creation conflicted.');
      metadata = existing.metadata;
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
        requireModified(activationWrite.modified, 'The campaign was moderated concurrently.');
        const locked = await this.store.getSubmissionVersioned(id);
        if (!locked?.value.activation || locked.value.activation.revision !== expectedRevision) {
          throw new ServiceError(409, 'Campaign approval activation could not be verified.');
        }
        activatedSubmission = locked;
      }
    }
    await this.store.setPackage(id, packageBytes);
    await this.store.setThumbnail(id, thumbnail);
    const current = await this.store.getMetadataVersioned(id);
    requireModified(
      (
        await this.store.setMetadata(
          metadata,
          current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
        )
      ).modified,
      'The campaign changed before public activation.',
    );
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
          throw new ServiceError(409, 'Campaign approval finalization conflicted. Retry.');
        }
      }
    }
    return metadata;
  }

  async rejectCampaign(
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
      throw new ServiceError(409, 'The moderation command targets a stale campaign revision.');
    }
    const moderatedAt = new Date().toISOString();
    const metadata = {
      ...submission.value.metadata,
      publicationStatus: 'archived' as const,
      updatedAt: moderatedAt,
    };
    requireModified(
      (
        await this.store.setSubmission(
          {
            ...submission.value,
            metadata,
            rejection: { reason: boundedReason, moderatorSub: moderator.sub, moderatedAt },
          },
          { onlyIfMatch: submission.etag },
        )
      ).modified,
      'The campaign was moderated concurrently.',
    );
    return metadata;
  }

  async rollbackCampaign(id: string, revision: number, moderator: AuthenticatedCreator) {
    await this.requireNotDeleted(id);
    const [release, packageBytes, thumbnail, current] = await Promise.all([
      this.store.getRelease(id, revision),
      this.store.getRevisionPackage(id, revision),
      this.store.getRevisionThumbnail(id, revision),
      this.store.getMetadataVersioned(id),
    ]);
    if (!release || !packageBytes || !thumbnail) {
      throw new ServiceError(404, 'Campaign release not found.');
    }
    if (sha256Hex(packageBytes) !== release.metadata.checksumSha256) {
      throw new ServiceError(409, 'Immutable campaign release checksum verification failed.');
    }
    const metadata: CampaignMetadata = {
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
    const claim = await this.store.getStableIdClaimVersioned(metadata.stableCampaignId);
    if (!claim || claim.value.repositoryId !== id || claim.value.state === 'deleted') {
      throw new ServiceError(409, 'Campaign stable identity is unavailable for rollback.');
    }
    if (claim.value.state === 'withdrawn') {
      requireModified(
        (
          await this.store.setStableIdClaim(
            { ...claim.value, state: 'active' },
            { onlyIfMatch: claim.etag },
          )
        ).modified,
        'The stable campaign identity changed before rollback.',
      );
    }
    await this.store.setPackage(id, packageBytes);
    await this.store.setThumbnail(id, thumbnail);
    requireModified(
      (
        await this.store.setMetadata(
          metadata,
          current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
        )
      ).modified,
      `The campaign changed before rollback by ${moderator.sub} could activate.`,
    );
    return metadata;
  }

  async withdrawCampaign(id: string, creator: AuthenticatedCreator) {
    await this.requireOwner(id, creator);
    const [submission, published] = await Promise.all([
      this.store.getSubmissionVersioned(id),
      this.store.getMetadataVersioned(id),
    ]);
    if (!submission && !published) throw new ServiceError(404, 'Campaign not found.');
    if (submission?.value.activation) {
      throw new ServiceError(409, 'Campaign approval is being activated. Reload and retry.');
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
        'The campaign changed concurrently. Reload and retry.',
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
        'The campaign changed concurrently. Reload and retry.',
      );
    }
    const source = submissionMetadata ?? publishedMetadata!;
    const claim = await this.store.getStableIdClaimVersioned(source.stableCampaignId);
    if (claim && claim.value.repositoryId === id && claim.value.state === 'active') {
      requireModified(
        (
          await this.store.setStableIdClaim(
            { ...claim.value, state: 'withdrawn' },
            { onlyIfMatch: claim.etag },
          )
        ).modified,
        'The stable campaign claim changed concurrently.',
      );
    }
    return source;
  }

  async assignCampaignOwner(id: string, creator: AuthenticatedCreator): Promise<void> {
    await this.requireNotDeleted(id);
    const [metadata, submission, existing] = await Promise.all([
      this.store.getMetadata(id),
      this.store.getSubmission(id),
      this.store.getOwnership(id),
    ]);
    if (!metadata && !submission) throw new ServiceError(404, 'Campaign not found.');
    if (existing && existing.ownerSub !== creator.sub) {
      throw new ServiceError(409, 'Campaign ownership is already assigned.');
    }
    if (existing) return;
    const now = new Date().toISOString();
    requireModified(
      (
        await this.store.setOwnership(
          {
            schemaVersion: 1,
            contentType: 'campaign',
            contentId: id,
            ownerSub: creator.sub,
            ownerEmail: creator.email,
            createdAt: now,
            updatedAt: now,
          },
          { onlyIfNew: true },
        )
      ).modified,
      'Campaign ownership was assigned concurrently.',
    );
  }

  async deleteCampaign(id: string, moderator: AuthenticatedCreator): Promise<void> {
    const [metadata, submission] = await Promise.all([
      this.store.getMetadata(id),
      this.store.getSubmission(id),
    ]);
    const source = submission?.metadata ?? metadata;
    if (!source && !(await this.store.getDeletion(id))) {
      throw new ServiceError(404, 'Campaign not found.');
    }
    const deletion = {
      schemaVersion: 1 as const,
      contentType: 'campaign' as const,
      contentId: id,
      deletedAt: new Date().toISOString(),
      deletedBySub: moderator.sub,
      retainedImmutableRevisions: true as const,
    };
    const deletionWrite = await this.store.setDeletion(deletion);
    if (!deletionWrite.modified && !(await this.store.getDeletion(id))) {
      throw new ServiceError(409, 'Campaign deletion conflicted. Retry.');
    }
    if (source) {
      const claim = await this.store.getStableIdClaimVersioned(source.stableCampaignId);
      if (claim && claim.value.repositoryId === id && claim.value.state !== 'deleted') {
        await this.store.setStableIdClaim(
          { ...claim.value, state: 'deleted' },
          { onlyIfMatch: claim.etag },
        );
      }
    }
    await this.store.deleteMutableCampaign(id);
  }
}
