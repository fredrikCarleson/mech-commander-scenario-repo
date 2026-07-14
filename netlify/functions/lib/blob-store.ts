import type { ScenarioMetadata, ScenarioRatings } from '../../../shared/schemas/metadata.ts';

export interface BlobListItem {
  key: string;
}

export interface ScenarioBlobStore {
  getMetadata(id: string): Promise<ScenarioMetadata | null>;
  setMetadata(metadata: ScenarioMetadata): Promise<void>;
  listMetadataKeys(): Promise<string[]>;
  getPackage(id: string): Promise<Uint8Array | null>;
  setPackage(id: string, data: Uint8Array): Promise<void>;
  getThumbnail(id: string): Promise<Uint8Array | null>;
  setThumbnail(id: string, data: Uint8Array): Promise<void>;
  getRatings(id: string): Promise<ScenarioRatings>;
  setRatings(id: string, ratings: ScenarioRatings): Promise<void>;
}
