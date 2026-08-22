import type {
  CampaignMetadata,
  CampaignRelease,
  CampaignSubmission,
  StableCampaignClaim,
} from '../../../shared/schemas/campaign.ts';
import type {
  AdministrativeDeletion,
  CreatorOwnership,
  ScenarioRatings,
} from '../../../shared/schemas/metadata.ts';
import type { ConditionalWriteResult, VersionedValue, WriteCondition } from './blob-concurrency.ts';

export interface CampaignBlobStore {
  getMetadata(id: string): Promise<CampaignMetadata | null>;
  getMetadataVersioned(id: string): Promise<VersionedValue<CampaignMetadata> | null>;
  setMetadata(
    metadata: CampaignMetadata,
    condition?: WriteCondition,
  ): Promise<ConditionalWriteResult>;
  listMetadataKeys(): Promise<string[]>;
  getPackage(id: string): Promise<Uint8Array | null>;
  setPackage(id: string, data: Uint8Array): Promise<ConditionalWriteResult>;
  getThumbnail(id: string): Promise<Uint8Array | null>;
  setThumbnail(id: string, data: Uint8Array): Promise<ConditionalWriteResult>;
  getRatings(id: string): Promise<ScenarioRatings>;
  getRatingsVersioned(id: string): Promise<VersionedValue<ScenarioRatings> | null>;
  setRatings(
    id: string,
    ratings: ScenarioRatings,
    condition?: WriteCondition,
  ): Promise<ConditionalWriteResult>;
  getOwnership(id: string): Promise<CreatorOwnership | null>;
  setOwnership(
    ownership: CreatorOwnership,
    condition?: WriteCondition,
  ): Promise<ConditionalWriteResult>;
  getSubmission(id: string): Promise<CampaignSubmission | null>;
  getSubmissionVersioned(id: string): Promise<VersionedValue<CampaignSubmission> | null>;
  setSubmission(
    submission: CampaignSubmission,
    condition?: WriteCondition,
  ): Promise<ConditionalWriteResult>;
  deleteSubmission(id: string): Promise<void>;
  listSubmissionKeys(): Promise<string[]>;
  getRevisionPackage(id: string, revision: number): Promise<Uint8Array | null>;
  setRevisionPackage(
    id: string,
    revision: number,
    bytes: Uint8Array,
  ): Promise<ConditionalWriteResult>;
  getRevisionThumbnail(id: string, revision: number): Promise<Uint8Array | null>;
  setRevisionThumbnail(
    id: string,
    revision: number,
    bytes: Uint8Array,
  ): Promise<ConditionalWriteResult>;
  getRelease(id: string, revision: number): Promise<CampaignRelease | null>;
  setRelease(release: CampaignRelease): Promise<ConditionalWriteResult>;
  getStableIdClaim(stableCampaignId: string): Promise<StableCampaignClaim | null>;
  getStableIdClaimVersioned(
    stableCampaignId: string,
  ): Promise<VersionedValue<StableCampaignClaim> | null>;
  setStableIdClaim(
    claim: StableCampaignClaim,
    condition: WriteCondition,
  ): Promise<ConditionalWriteResult>;
  getDeletion(id: string): Promise<AdministrativeDeletion | null>;
  setDeletion(deletion: AdministrativeDeletion): Promise<ConditionalWriteResult>;
  deleteMutableCampaign(id: string): Promise<boolean>;
}
