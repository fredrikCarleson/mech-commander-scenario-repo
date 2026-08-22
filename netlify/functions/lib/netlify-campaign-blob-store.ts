import { getStore } from '@netlify/blobs';
import {
  CAMPAIGN_METADATA_PREFIX,
  CAMPAIGN_SUBMISSION_PREFIX,
  campaignDeletionKey,
  campaignMetadataKey,
  campaignOwnershipKey,
  campaignPackageKey,
  campaignRatingsKey,
  campaignReleaseKey,
  campaignRevisionPackageKey,
  campaignRevisionThumbnailKey,
  campaignStableIdClaimKey,
  campaignSubmissionKey,
  campaignThumbnailKey,
} from '../../../shared/blob-keys.ts';
import {
  campaignMetadataSchema,
  campaignReleaseSchema,
  campaignSubmissionSchema,
  stableCampaignClaimSchema,
  type CampaignMetadata,
  type CampaignRelease,
  type CampaignSubmission,
  type StableCampaignClaim,
} from '../../../shared/schemas/campaign.ts';
import {
  administrativeDeletionSchema,
  creatorOwnershipSchema,
  scenarioRatingsSchema,
  type AdministrativeDeletion,
  type CreatorOwnership,
  type ScenarioRatings,
} from '../../../shared/schemas/metadata.ts';
import type { WriteCondition } from './blob-concurrency.ts';
import type { CampaignBlobStore } from './campaign-blob-store.ts';
import { resolveCommunityEnvironment } from './community-environment.ts';

function requireEtag(etag: string | undefined, key: string): string {
  if (!etag) throw new Error(`Blob ${key} did not include an ETag.`);
  return etag;
}

export function createNetlifyCampaignBlobStore(): CampaignBlobStore {
  const store = getStore({
    name: resolveCommunityEnvironment().blobStore,
    consistency: 'strong',
  });

  async function getJsonVersioned<T>(key: string, parse: (input: unknown) => T) {
    const result = await store.getWithMetadata(key, { type: 'text' });
    return result
      ? { value: parse(JSON.parse(result.data)), etag: requireEtag(result.etag, key) }
      : null;
  }

  function setJson(key: string, value: unknown, condition?: WriteCondition) {
    return store.set(key, JSON.stringify(value), {
      metadata: { contentType: 'application/json' },
      ...condition,
    });
  }

  return {
    async getMetadata(id) {
      return (await this.getMetadataVersioned(id))?.value ?? null;
    },
    getMetadataVersioned(id) {
      return getJsonVersioned(campaignMetadataKey(id), campaignMetadataSchema.parse);
    },
    setMetadata(metadata, condition) {
      return setJson(campaignMetadataKey(metadata.id), metadata, condition);
    },
    async listMetadataKeys() {
      const { blobs } = await store.list({ prefix: CAMPAIGN_METADATA_PREFIX });
      return blobs.map((blob) => blob.key);
    },
    async getPackage(id) {
      const value = await store.get(campaignPackageKey(id), { type: 'arrayBuffer' });
      return value ? new Uint8Array(value) : null;
    },
    setPackage(id, data) {
      return store.set(campaignPackageKey(id), data, {
        metadata: { contentType: 'application/zip' },
      });
    },
    async getThumbnail(id) {
      const value = await store.get(campaignThumbnailKey(id), { type: 'arrayBuffer' });
      return value ? new Uint8Array(value) : null;
    },
    setThumbnail(id, data) {
      return store.set(campaignThumbnailKey(id), data, {
        metadata: { contentType: 'image/webp' },
      });
    },
    async getRatings(id) {
      return (await this.getRatingsVersioned(id))?.value ?? { ratings: [] };
    },
    getRatingsVersioned(id) {
      return getJsonVersioned(campaignRatingsKey(id), scenarioRatingsSchema.parse);
    },
    setRatings(id, ratings, condition) {
      return setJson(campaignRatingsKey(id), ratings, condition);
    },
    async getOwnership(id) {
      return (
        (await getJsonVersioned(campaignOwnershipKey(id), creatorOwnershipSchema.parse))?.value ??
        null
      );
    },
    setOwnership(ownership, condition) {
      return setJson(campaignOwnershipKey(ownership.contentId), ownership, condition);
    },
    async getSubmission(id) {
      return (await this.getSubmissionVersioned(id))?.value ?? null;
    },
    getSubmissionVersioned(id) {
      return getJsonVersioned(campaignSubmissionKey(id), campaignSubmissionSchema.parse);
    },
    setSubmission(submission, condition) {
      return setJson(campaignSubmissionKey(submission.id), submission, condition);
    },
    async deleteSubmission(id) {
      await store.delete(campaignSubmissionKey(id));
    },
    async listSubmissionKeys() {
      const { blobs } = await store.list({ prefix: CAMPAIGN_SUBMISSION_PREFIX });
      return blobs.map((blob) => blob.key);
    },
    async getRevisionPackage(id, revision) {
      const value = await store.get(campaignRevisionPackageKey(id, revision), {
        type: 'arrayBuffer',
      });
      return value ? new Uint8Array(value) : null;
    },
    setRevisionPackage(id, revision, bytes) {
      return store.set(campaignRevisionPackageKey(id, revision), bytes, {
        metadata: { contentType: 'application/zip' },
        onlyIfNew: true,
      });
    },
    async getRevisionThumbnail(id, revision) {
      const value = await store.get(campaignRevisionThumbnailKey(id, revision), {
        type: 'arrayBuffer',
      });
      return value ? new Uint8Array(value) : null;
    },
    setRevisionThumbnail(id, revision, bytes) {
      return store.set(campaignRevisionThumbnailKey(id, revision), bytes, {
        metadata: { contentType: 'image/webp' },
        onlyIfNew: true,
      });
    },
    async getRelease(id, revision) {
      return (
        (await getJsonVersioned(campaignReleaseKey(id, revision), campaignReleaseSchema.parse))
          ?.value ?? null
      );
    },
    setRelease(release) {
      return setJson(campaignReleaseKey(release.id, release.revision), release, {
        onlyIfNew: true,
      });
    },
    async getStableIdClaim(stableCampaignId) {
      return (await this.getStableIdClaimVersioned(stableCampaignId))?.value ?? null;
    },
    getStableIdClaimVersioned(stableCampaignId) {
      return getJsonVersioned(
        campaignStableIdClaimKey(stableCampaignId),
        stableCampaignClaimSchema.parse,
      );
    },
    setStableIdClaim(claim, condition) {
      return setJson(campaignStableIdClaimKey(claim.stableCampaignId), claim, condition);
    },
    async getDeletion(id) {
      return (
        (await getJsonVersioned(campaignDeletionKey(id), administrativeDeletionSchema.parse))
          ?.value ?? null
      );
    },
    setDeletion(deletion) {
      return setJson(campaignDeletionKey(deletion.contentId), deletion, { onlyIfNew: true });
    },
    async deleteMutableCampaign(id) {
      const [metadata, submission] = await Promise.all([
        store.get(campaignMetadataKey(id), { type: 'text' }),
        store.get(campaignSubmissionKey(id), { type: 'text' }),
      ]);
      if (!metadata && !submission) return false;
      await Promise.all([
        store.delete(campaignMetadataKey(id)),
        store.delete(campaignPackageKey(id)),
        store.delete(campaignThumbnailKey(id)),
        store.delete(campaignRatingsKey(id)),
        store.delete(campaignOwnershipKey(id)),
        store.delete(campaignSubmissionKey(id)),
      ]);
      return true;
    },
  };
}

interface MemoryEntry<T> {
  value: T;
  etag: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCampaignBlobStore implements CampaignBlobStore {
  private sequence = 0;
  private metadata = new Map<string, MemoryEntry<CampaignMetadata>>();
  private packages = new Map<string, Uint8Array>();
  private thumbnails = new Map<string, Uint8Array>();
  private ratings = new Map<string, MemoryEntry<ScenarioRatings>>();
  private ownership = new Map<string, MemoryEntry<CreatorOwnership>>();
  private submissions = new Map<string, MemoryEntry<CampaignSubmission>>();
  private revisionPackages = new Map<string, Uint8Array>();
  private revisionThumbnails = new Map<string, Uint8Array>();
  private releases = new Map<string, CampaignRelease>();
  private claims = new Map<string, MemoryEntry<StableCampaignClaim>>();
  private deletions = new Map<string, AdministrativeDeletion>();

  private write<T>(
    map: Map<string, MemoryEntry<T>>,
    key: string,
    value: T,
    condition?: WriteCondition,
  ) {
    const current = map.get(key);
    if (condition?.onlyIfNew && current) return { modified: false };
    if (condition?.onlyIfMatch && current?.etag !== condition.onlyIfMatch) {
      return { modified: false };
    }
    const etag = `memory-${++this.sequence}`;
    map.set(key, { value: clone(value), etag });
    return { modified: true, etag };
  }

  async getMetadata(id: string) {
    return (await this.getMetadataVersioned(id))?.value ?? null;
  }
  async getMetadataVersioned(id: string) {
    const entry = this.metadata.get(id);
    return entry ? clone(entry) : null;
  }
  async setMetadata(value: CampaignMetadata, condition?: WriteCondition) {
    return this.write(this.metadata, value.id, value, condition);
  }
  async listMetadataKeys() {
    return [...this.metadata.keys()].map(campaignMetadataKey);
  }
  async getPackage(id: string) {
    const value = this.packages.get(id);
    return value ? value.slice() : null;
  }
  async setPackage(id: string, value: Uint8Array) {
    this.packages.set(id, value.slice());
    return { modified: true, etag: `memory-${++this.sequence}` };
  }
  async getThumbnail(id: string) {
    const value = this.thumbnails.get(id);
    return value ? value.slice() : null;
  }
  async setThumbnail(id: string, value: Uint8Array) {
    this.thumbnails.set(id, value.slice());
    return { modified: true, etag: `memory-${++this.sequence}` };
  }
  async getRatings(id: string) {
    return (await this.getRatingsVersioned(id))?.value ?? { ratings: [] };
  }
  async getRatingsVersioned(id: string) {
    const entry = this.ratings.get(id);
    return entry ? clone(entry) : null;
  }
  async setRatings(id: string, value: ScenarioRatings, condition?: WriteCondition) {
    return this.write(this.ratings, id, value, condition);
  }
  async getOwnership(id: string) {
    const entry = this.ownership.get(id);
    return entry ? clone(entry.value) : null;
  }
  async setOwnership(value: CreatorOwnership, condition?: WriteCondition) {
    return this.write(this.ownership, value.contentId, value, condition);
  }
  async getSubmission(id: string) {
    return (await this.getSubmissionVersioned(id))?.value ?? null;
  }
  async getSubmissionVersioned(id: string) {
    const entry = this.submissions.get(id);
    return entry ? clone(entry) : null;
  }
  async setSubmission(value: CampaignSubmission, condition?: WriteCondition) {
    return this.write(this.submissions, value.id, value, condition);
  }
  async deleteSubmission(id: string) {
    this.submissions.delete(id);
  }
  async listSubmissionKeys() {
    return [...this.submissions.keys()].map(campaignSubmissionKey);
  }
  async getRevisionPackage(id: string, revision: number) {
    const value = this.revisionPackages.get(`${id}:${revision}`);
    return value ? value.slice() : null;
  }
  async setRevisionPackage(id: string, revision: number, value: Uint8Array) {
    const key = `${id}:${revision}`;
    if (this.revisionPackages.has(key)) return { modified: false };
    this.revisionPackages.set(key, value.slice());
    return { modified: true, etag: `memory-${++this.sequence}` };
  }
  async getRevisionThumbnail(id: string, revision: number) {
    const value = this.revisionThumbnails.get(`${id}:${revision}`);
    return value ? value.slice() : null;
  }
  async setRevisionThumbnail(id: string, revision: number, value: Uint8Array) {
    const key = `${id}:${revision}`;
    if (this.revisionThumbnails.has(key)) return { modified: false };
    this.revisionThumbnails.set(key, value.slice());
    return { modified: true, etag: `memory-${++this.sequence}` };
  }
  async getRelease(id: string, revision: number) {
    return clone(this.releases.get(`${id}:${revision}`) ?? null);
  }
  async setRelease(value: CampaignRelease) {
    const key = `${value.id}:${value.revision}`;
    if (this.releases.has(key)) return { modified: false };
    this.releases.set(key, clone(value));
    return { modified: true, etag: `memory-${++this.sequence}` };
  }
  async getStableIdClaim(stableCampaignId: string) {
    return (await this.getStableIdClaimVersioned(stableCampaignId))?.value ?? null;
  }
  async getStableIdClaimVersioned(stableCampaignId: string) {
    const entry = this.claims.get(stableCampaignId);
    return entry ? clone(entry) : null;
  }
  async setStableIdClaim(value: StableCampaignClaim, condition: WriteCondition) {
    return this.write(this.claims, value.stableCampaignId, value, condition);
  }
  async getDeletion(id: string) {
    return clone(this.deletions.get(id) ?? null);
  }
  async setDeletion(value: AdministrativeDeletion) {
    if (this.deletions.has(value.contentId)) return { modified: false };
    this.deletions.set(value.contentId, clone(value));
    return { modified: true, etag: `memory-${++this.sequence}` };
  }
  async deleteMutableCampaign(id: string) {
    const exists = this.metadata.has(id) || this.submissions.has(id);
    this.metadata.delete(id);
    this.packages.delete(id);
    this.thumbnails.delete(id);
    this.ratings.delete(id);
    this.ownership.delete(id);
    this.submissions.delete(id);
    return exists;
  }
}
