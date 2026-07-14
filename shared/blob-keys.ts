export function metadataKey(scenarioId: string): string {
  return `meta/${scenarioId}.json`;
}

export function packageKey(scenarioId: string): string {
  return `pkg/${scenarioId}.zip`;
}

export function ratingsKey(scenarioId: string): string {
  return `ratings/${scenarioId}.json`;
}

export function thumbnailKey(scenarioId: string): string {
  return `thumb/${scenarioId}.webp`;
}

export const METADATA_PREFIX = 'meta/';
