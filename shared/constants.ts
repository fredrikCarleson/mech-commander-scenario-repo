/** Repository metadata record format version */
export const METADATA_SCHEMA_VERSION = '1.0.0' as const;

/** Supported manifest.json schema versions */
export const SUPPORTED_MANIFEST_SCHEMA_VERSIONS = ['1.0.0'] as const;

/** Supported map.json schema versions */
export const SUPPORTED_MAP_SCHEMA_VERSIONS = ['1.0.0'] as const;

/** Supported scenario.json schema versions */
export const SUPPORTED_SCENARIO_FILE_SCHEMA_VERSIONS = ['1.0.0'] as const;

/** Mech Commander game versions this repository accepts */
export const SUPPORTED_GAME_VERSIONS = ['1.0.0', '1.1.0'] as const;

/** Scenario format versions accepted for upload */
export const SUPPORTED_SCENARIO_FORMAT_VERSIONS = ['1.0.0'] as const;

export const REQUIRED_PACKAGE_FILES = [
  'manifest.json',
  'scenario.json',
  'map.json',
  'thumbnail.webp',
] as const;

export const ALLOWED_PACKAGE_FILES = new Set<string>([...REQUIRED_PACKAGE_FILES]);

export const DEFAULT_MAX_COMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MiB
export const DEFAULT_MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MiB

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const BLOB_STORE_NAME = 'mech-scenarios';

export const DIFFICULTIES = ['recruit', 'regular', 'veteran', 'elite'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SORT_OPTIONS = ['newest', 'rating', 'downloads'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const PUBLICATION_STATUSES = ['published', 'draft', 'archived'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
