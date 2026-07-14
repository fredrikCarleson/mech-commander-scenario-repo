import { createHash, randomUUID } from 'node:crypto';
import {
  DEFAULT_MAX_COMPRESSED_BYTES,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  MAX_PAGE_SIZE,
  METADATA_SCHEMA_VERSION,
} from '../../../shared/constants.ts';
import { metadataKey } from '../../../shared/blob-keys.ts';
import { detectCompatibility } from '../../../shared/compatibility.ts';
import {
  scenarioListQuerySchema,
  submitRatingBodySchema,
  type ScenarioListQuery,
  type ScenarioListResponse,
  type SubmitRatingResponse,
} from '../../../shared/schemas/api.ts';
import type { ScenarioMetadata } from '../../../shared/schemas/metadata.ts';
import { validateScenarioPackage } from '../../../shared/validation/package-validator.ts';
import type { ScenarioBlobStore } from './blob-store.ts';

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function metadataIdFromKey(key: string): string | null {
  const match = key.match(/^meta\/(.+)\.json$/);
  return match?.[1] ?? null;
}

function matchesSearch(metadata: ScenarioMetadata, search: string): boolean {
  const needle = search.toLowerCase();
  const haystacks = [
    metadata.title,
    metadata.description,
    metadata.authorDisplayName,
    ...metadata.tags,
  ];
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

function matchesTags(metadata: ScenarioMetadata, tags: string[]): boolean {
  if (tags.length === 0) {
    return true;
  }
  const normalized = new Set(metadata.tags.map((tag) => tag.toLowerCase()));
  return tags.every((tag) => normalized.has(tag.toLowerCase()));
}

function sortScenarios(
  items: ScenarioMetadata[],
  sort: ScenarioListQuery['sort'],
): ScenarioMetadata[] {
  const copy = [...items];
  switch (sort) {
    case 'rating':
      return copy.sort((a, b) => {
        if (b.averageRating !== a.averageRating) {
          return b.averageRating - a.averageRating;
        }
        return b.ratingCount - a.ratingCount;
      });
    case 'downloads':
      return copy.sort((a, b) => b.downloadCount - a.downloadCount);
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export class ScenarioService {
  constructor(private readonly store: ScenarioBlobStore) {}

  async listScenarios(rawQuery: Record<string, string | undefined>): Promise<ScenarioListResponse> {
    const parsed = scenarioListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid query parameters.',
        parsed.error.issues.map((i) => i.message),
      );
    }

    const query = parsed.data;
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    const tagFilters = query.tags
      ? query.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    const keys = await this.store.listMetadataKeys();
    const allMetadata: ScenarioMetadata[] = [];

    for (const key of keys) {
      const id = metadataIdFromKey(key);
      if (!id) {
        continue;
      }
      const metadata = await this.store.getMetadata(id);
      if (!metadata || metadata.publicationStatus !== 'published') {
        continue;
      }
      allMetadata.push(metadata);
    }

    let filtered = allMetadata;

    if (query.search) {
      filtered = filtered.filter((item) => matchesSearch(item, query.search!));
    }

    if (query.difficulty) {
      filtered = filtered.filter((item) => item.difficulty === query.difficulty);
    }

    if (query.maxTonnage != null) {
      filtered = filtered.filter((item) => item.maximumTonnage <= query.maxTonnage!);
    }

    if (tagFilters.length > 0) {
      filtered = filtered.filter((item) => matchesTags(item, tagFilters));
    }

    const sorted = sortScenarios(filtered, query.sort);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const start = (query.page - 1) * limit;
    const items = sorted.slice(start, start + limit);

    return {
      items,
      page: query.page,
      limit,
      total,
      totalPages,
    };
  }

  async getScenario(id: string): Promise<ScenarioMetadata | null> {
    const metadata = await this.store.getMetadata(id);
    if (!metadata || metadata.publicationStatus !== 'published') {
      return null;
    }
    return metadata;
  }

  async downloadScenario(
    id: string,
  ): Promise<{ metadata: ScenarioMetadata; packageBytes: Uint8Array } | null> {
    const metadata = await this.getScenario(id);
    if (!metadata) {
      return null;
    }

    const packageBytes = await this.store.getPackage(id);
    if (!packageBytes) {
      return null;
    }

    const updated: ScenarioMetadata = {
      ...metadata,
      downloadCount: metadata.downloadCount + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.setMetadata(updated);

    return { metadata: updated, packageBytes };
  }

  async uploadScenario(packageBytes: Uint8Array): Promise<ScenarioMetadata> {
    const validation = await validateScenarioPackage(packageBytes, {
      maxCompressedBytes: Number(process.env.MAX_COMPRESSED_BYTES ?? DEFAULT_MAX_COMPRESSED_BYTES),
      maxDecompressedBytes: Number(
        process.env.MAX_DECOMPRESSED_BYTES ?? DEFAULT_MAX_DECOMPRESSED_BYTES,
      ),
    });

    if (!validation.ok) {
      throw new ServiceError(400, 'Scenario package validation failed.', validation.errors);
    }

    const { manifest, map, thumbnail } = validation.contents;
    const id = randomUUID();
    const now = new Date().toISOString();
    const compatibility = detectCompatibility(manifest.gameVersion, manifest.scenarioFormatVersion);

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
      mapDimensions: {
        width: map.width,
        height: map.height,
      },
      averageRating: 0,
      ratingCount: 0,
      downloadCount: 0,
      packageFileSize: packageBytes.byteLength,
      checksumSha256: sha256Hex(packageBytes),
      createdAt: now,
      updatedAt: now,
      publicationStatus: 'published',
      compatibility,
    };

    await this.store.setPackage(id, packageBytes);
    await this.store.setThumbnail(id, thumbnail);
    await this.store.setMetadata(metadata);
    await this.store.setRatings(id, { ratings: [] });

    return metadata;
  }

  async getThumbnail(id: string): Promise<Uint8Array | null> {
    const metadata = await this.getScenario(id);
    if (!metadata) {
      return null;
    }
    return this.store.getThumbnail(id);
  }

  async submitRating(id: string, body: unknown): Promise<SubmitRatingResponse> {
    const metadata = await this.getScenario(id);
    if (!metadata) {
      throw new ServiceError(404, 'Scenario not found.');
    }

    const parsed = submitRatingBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceError(
        400,
        'Invalid rating payload.',
        parsed.error.issues.map((i) => i.message),
      );
    }

    const { clientId, rating } = parsed.data;
    const ratingsDoc = await this.store.getRatings(id);
    const existingIndex = ratingsDoc.ratings.findIndex((entry) => entry.clientId === clientId);
    const updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
      ratingsDoc.ratings[existingIndex] = { clientId, rating, updatedAt };
    } else {
      ratingsDoc.ratings.push({ clientId, rating, updatedAt });
    }

    const total = ratingsDoc.ratings.reduce((sum, entry) => sum + entry.rating, 0);
    const averageRating = ratingsDoc.ratings.length > 0 ? total / ratingsDoc.ratings.length : 0;

    const updatedMetadata: ScenarioMetadata = {
      ...metadata,
      averageRating: Math.round(averageRating * 100) / 100,
      ratingCount: ratingsDoc.ratings.length,
      updatedAt,
    };

    await this.store.setRatings(id, ratingsDoc);
    await this.store.setMetadata(updatedMetadata);

    return {
      averageRating: updatedMetadata.averageRating,
      ratingCount: updatedMetadata.ratingCount,
      yourRating: rating,
    };
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
    if (!id) {
      continue;
    }
    const metadata = await store.getMetadata(id);
    if (metadata) {
      items.push(metadata);
    }
  }
  return items;
}
