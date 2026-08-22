import {
  ALLOWED_PACKAGE_FILES,
  COMMUNITY_MAX_SCENARIO_ZIP_ENTRIES,
  COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES,
  DEFAULT_MAX_COMPRESSED_BYTES,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  REQUIRED_PACKAGE_FILES,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  SUPPORTED_MAP_SCHEMA_VERSIONS,
  SUPPORTED_SCENARIO_FILE_SCHEMA_VERSIONS,
} from '../constants.ts';
import { detectCompatibility, isFullyCompatible } from '../compatibility.ts';
import { manifestSchema, type Manifest } from '../schemas/manifest.ts';
import { mapFileSchema, type MapFile } from '../schemas/map.ts';
import {
  scenarioFileSchema,
  type ScenarioFile,
  isGameScenarioFile,
} from '../schemas/scenario-file.ts';
import {
  getRootFileName,
  hasDangerousExtension,
  isUnsafeZipPath,
  isValidJsonExtension,
  isValidWebp,
} from './zip-security.ts';
import { inspectCommunityImage } from './image-validation.ts';
import { unzipSafe } from './safe-zip.ts';

export interface ValidatedPackageContents {
  manifest: Manifest;
  map: MapFile;
  scenario: ScenarioFile;
  thumbnail: Uint8Array;
}

export interface PackageValidationOptions {
  maxCompressedBytes?: number;
  maxDecompressedBytes?: number;
}

export interface PackageValidationSuccess {
  ok: true;
  contents: ValidatedPackageContents;
}

export interface PackageValidationFailure {
  ok: false;
  errors: string[];
}

export type PackageValidationResult = PackageValidationSuccess | PackageValidationFailure;

function fail(errors: string[]): PackageValidationFailure {
  return { ok: false, errors };
}

function parseJson<T>(
  label: string,
  bytes: Uint8Array,
  schema: {
    safeParse: (input: unknown) => {
      success: boolean;
      data?: T;
      error?: { issues: { message: string }[] };
    };
  },
): { ok: true; data: T } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: `${label} contains malformed JSON.` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const messages =
      result.error?.issues.map((issue) => issue.message).join('; ') ?? 'Invalid structure';
    return { ok: false, error: `${label} failed validation: ${messages}` };
  }

  return { ok: true, data: result.data as T };
}

export async function validateScenarioPackage(
  compressedBytes: Uint8Array,
  options: PackageValidationOptions = {},
): Promise<PackageValidationResult> {
  const maxCompressed = options.maxCompressedBytes ?? DEFAULT_MAX_COMPRESSED_BYTES;
  const maxDecompressed = options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
  const errors: string[] = [];

  if (compressedBytes.byteLength === 0) {
    return fail(['Package is empty.']);
  }

  if (compressedBytes.byteLength > maxCompressed) {
    return fail([`Compressed package exceeds maximum size of ${maxCompressed} bytes.`]);
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSafe(compressedBytes, {
      maxCompressedBytes: maxCompressed,
      maxDecompressedBytes: maxDecompressed,
      maxEntries: COMMUNITY_MAX_SCENARIO_ZIP_ENTRIES,
    });
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Package is not a valid ZIP archive.']);
  }

  const entries = Object.keys(files);
  const rootFiles = new Map<string, Uint8Array>();

  for (const entryPath of entries) {
    if (isUnsafeZipPath(entryPath)) {
      errors.push(`Unsafe ZIP path rejected: ${entryPath}`);
      continue;
    }

    const rootName = getRootFileName(entryPath);
    if (!rootName) {
      errors.push(`Only root-level files are allowed; rejected: ${entryPath}`);
      continue;
    }

    if (hasDangerousExtension(rootName)) {
      errors.push(`Executable or active-content file rejected: ${rootName}`);
      continue;
    }

    if (!ALLOWED_PACKAGE_FILES.has(rootName)) {
      errors.push(`Unexpected file in package: ${rootName}`);
      continue;
    }

    if (rootFiles.has(rootName)) {
      errors.push(`Duplicate file entry: ${rootName}`);
      continue;
    }

    rootFiles.set(rootName, files[entryPath]!);
  }

  for (const required of REQUIRED_PACKAGE_FILES) {
    if (!rootFiles.has(required)) {
      errors.push(`Missing required file: ${required}`);
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const manifestBytes = rootFiles.get('manifest.json')!;
  const scenarioBytes = rootFiles.get('scenario.json')!;
  const mapBytes = rootFiles.get('map.json')!;
  const thumbnailBytes = rootFiles.get('thumbnail.webp')!;

  if (thumbnailBytes.byteLength > COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES) {
    return fail([
      `thumbnail.webp exceeds the ${COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES}-byte image limit.`,
    ]);
  }

  if (
    !isValidJsonExtension('manifest.json') ||
    !isValidJsonExtension('scenario.json') ||
    !isValidJsonExtension('map.json')
  ) {
    return fail(['JSON files must use a .json extension.']);
  }

  if (!isValidWebp(thumbnailBytes)) {
    return fail(['thumbnail.webp is not a valid WebP image.']);
  }
  try {
    inspectCommunityImage(thumbnailBytes, 'image/webp');
  } catch (error) {
    return fail([
      `thumbnail.webp failed image validation: ${error instanceof Error ? error.message : 'Invalid image.'}`,
    ]);
  }

  const manifestResult = parseJson('manifest.json', manifestBytes, manifestSchema);
  if (!manifestResult.ok) {
    return fail([manifestResult.error]);
  }

  const mapResult = parseJson('map.json', mapBytes, mapFileSchema);
  if (!mapResult.ok) {
    return fail([mapResult.error]);
  }

  const scenarioResult = parseJson('scenario.json', scenarioBytes, scenarioFileSchema);
  if (!scenarioResult.ok) {
    return fail([scenarioResult.error]);
  }

  const manifest = manifestResult.data;
  const map = mapResult.data;
  const scenario = scenarioResult.data;

  if (!(SUPPORTED_MANIFEST_SCHEMA_VERSIONS as readonly string[]).includes(manifest.schemaVersion)) {
    return fail([
      `Unsupported manifest schema version: ${manifest.schemaVersion}. Supported: ${SUPPORTED_MANIFEST_SCHEMA_VERSIONS.join(', ')}.`,
    ]);
  }

  if (!(SUPPORTED_MAP_SCHEMA_VERSIONS as readonly string[]).includes(map.schemaVersion)) {
    return fail([
      `Unsupported map schema version: ${map.schemaVersion}. Supported: ${SUPPORTED_MAP_SCHEMA_VERSIONS.join(', ')}.`,
    ]);
  }

  if (isGameScenarioFile(scenario)) {
    if (map.rows?.length) {
      if (map.rows.length !== map.height) {
        errors.push('map.json rows length must match height.');
      } else if (map.rows.some((row) => row.length !== map.width)) {
        errors.push('Each map.json row width must match map width.');
      }
    }
  } else if (
    !(SUPPORTED_SCENARIO_FILE_SCHEMA_VERSIONS as readonly string[]).includes(scenario.schemaVersion)
  ) {
    return fail([
      `Unsupported scenario schema version: ${scenario.schemaVersion}. Supported: ${SUPPORTED_SCENARIO_FILE_SCHEMA_VERSIONS.join(', ')}.`,
    ]);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  if (manifest.maximumTonnage < manifest.recommendedTonnage) {
    return fail(['maximumTonnage must be greater than or equal to recommendedTonnage.']);
  }

  const compatibility = detectCompatibility(manifest.gameVersion, manifest.scenarioFormatVersion);

  if (!isFullyCompatible(compatibility)) {
    return fail(compatibility.warnings);
  }

  return {
    ok: true,
    contents: {
      manifest,
      map,
      scenario,
      thumbnail: thumbnailBytes,
    },
  };
}
