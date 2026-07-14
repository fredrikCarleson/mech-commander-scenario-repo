import { getStore } from '@netlify/blobs';
import { metadataKey, packageKey, ratingsKey, thumbnailKey, METADATA_PREFIX } from '../../../shared/blob-keys.ts';
import {
  scenarioMetadataSchema,
  scenarioRatingsSchema,
  type ScenarioMetadata,
  type ScenarioRatings,
} from '../../../shared/schemas/metadata.ts';
import { BLOB_STORE_NAME } from '../../../shared/constants.ts';
import type { ScenarioBlobStore } from './blob-store.ts';

function getStoreName(): string {
  return process.env.SCENARIO_BLOB_STORE ?? BLOB_STORE_NAME;
}

export function createNetlifyBlobStore(): ScenarioBlobStore {
  const store = getStore(getStoreName());

  return {
    async getMetadata(id) {
      const blob = await store.get(metadataKey(id), { type: 'text' });
      if (!blob) {
        return null;
      }
      return scenarioMetadataSchema.parse(JSON.parse(blob));
    },

    async setMetadata(metadata) {
      await store.set(metadataKey(metadata.id), JSON.stringify(metadata), {
        metadata: { contentType: 'application/json' },
      });
    },

    async listMetadataKeys() {
      const { blobs } = await store.list({ prefix: METADATA_PREFIX });
      return blobs.map((blob) => blob.key);
    },

    async getPackage(id) {
      const data = await store.get(packageKey(id), { type: 'arrayBuffer' });
      if (!data) {
        return null;
      }
      return new Uint8Array(data);
    },

    async setPackage(id, data) {
      await store.set(packageKey(id), data, {
        metadata: { contentType: 'application/zip' },
      });
    },

    async getThumbnail(id) {
      const data = await store.get(thumbnailKey(id), { type: 'arrayBuffer' });
      if (!data) {
        return null;
      }
      return new Uint8Array(data);
    },

    async setThumbnail(id, data) {
      await store.set(thumbnailKey(id), data, {
        metadata: { contentType: 'image/webp' },
      });
    },

    async getRatings(id) {
      const blob = await store.get(ratingsKey(id), { type: 'text' });
      if (!blob) {
        return { ratings: [] };
      }
      return scenarioRatingsSchema.parse(JSON.parse(blob));
    },

    async setRatings(id, ratings) {
      await store.set(ratingsKey(id), JSON.stringify(ratings), {
        metadata: { contentType: 'application/json' },
      });
    },
  };
}

export class InMemoryBlobStore implements ScenarioBlobStore {
  private metadata = new Map<string, ScenarioMetadata>();
  private packages = new Map<string, Uint8Array>();
  private thumbnails = new Map<string, Uint8Array>();
  private ratings = new Map<string, ScenarioRatings>();

  async getMetadata(id: string): Promise<ScenarioMetadata | null> {
    return this.metadata.get(id) ?? null;
  }

  async setMetadata(metadata: ScenarioMetadata): Promise<void> {
    this.metadata.set(metadata.id, metadata);
  }

  async listMetadataKeys(): Promise<string[]> {
    return [...this.metadata.keys()].map((id) => metadataKey(id));
  }

  async getPackage(id: string): Promise<Uint8Array | null> {
    return this.packages.get(id) ?? null;
  }

  async setPackage(id: string, data: Uint8Array): Promise<void> {
    this.packages.set(id, data);
  }

  async getThumbnail(id: string): Promise<Uint8Array | null> {
    return this.thumbnails.get(id) ?? null;
  }

  async setThumbnail(id: string, data: Uint8Array): Promise<void> {
    this.thumbnails.set(id, data);
  }

  async getRatings(id: string): Promise<ScenarioRatings> {
    return this.ratings.get(id) ?? { ratings: [] };
  }

  async setRatings(id: string, ratings: ScenarioRatings): Promise<void> {
    this.ratings.set(id, ratings);
  }
}
