import JSZip from 'jszip';
import {
  ALLOWED_PACKAGE_FILES,
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
import { scenarioFileSchema, type ScenarioFile } from '../schemas/scenario-file.ts';
import {
  getRootFileName,
  hasDangerousExtension,
  isUnsafeZipPath,
  isValidJsonExtension,
  isValidWebp,
} from './zip-security.ts';

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

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(compressedBytes);
  } catch {
    return fail(['Package is not a valid ZIP archive.']);
  }

  const entries = Object.keys(zip.files);
  const rootFiles = new Map<string, JSZip.JSZipObject>();
  let decompressedTotal = 0;

  for (const entryPath of entries) {
    const entry = zip.files[entryPath];
    if (!entry || entry.dir) {
      if (entry?.dir && !isUnsafeZipPath(entryPath)) {
        errors.push(`Directories are not allowed in scenario packages: ${entryPath}`);
      }
      continue;
    }

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

    const uncompressed = await entry.async('uint8array');
    decompressedTotal += uncompressed.byteLength;
    if (decompressedTotal > maxDecompressed) {
      return fail([`Decompressed package exceeds maximum size of ${maxDecompressed} bytes.`]);
    }

    rootFiles.set(rootName, entry);
  }

  for (const required of REQUIRED_PACKAGE_FILES) {
    if (!rootFiles.has(required)) {
      errors.push(`Missing required file: ${required}`);
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const manifestBytes = await rootFiles.get('manifest.json')!.async('uint8array');
  const scenarioBytes = await rootFiles.get('scenario.json')!.async('uint8array');
  const mapBytes = await rootFiles.get('map.json')!.async('uint8array');
  const thumbnailBytes = await rootFiles.get('thumbnail.webp')!.async('uint8array');

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

  if (
    !(SUPPORTED_SCENARIO_FILE_SCHEMA_VERSIONS as readonly string[]).includes(scenario.schemaVersion)
  ) {
    return fail([
      `Unsupported scenario schema version: ${scenario.schemaVersion}. Supported: ${SUPPORTED_SCENARIO_FILE_SCHEMA_VERSIONS.join(', ')}.`,
    ]);
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
