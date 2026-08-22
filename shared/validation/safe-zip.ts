import { unzipSync, type UnzipFileInfo } from 'fflate';

export interface SafeZipLimits {
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxEntries: number;
}

export function normalizeSafeZipPath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function assertSafeZipPath(path: string): string {
  if (!path || path.includes('\0') || /^[\\/]/.test(path) || /^[a-z]:/i.test(path)) {
    throw new Error(`ZIP contains an unsafe path: ${JSON.stringify(path)}.`);
  }
  if (path.includes('\\')) {
    throw new Error(`ZIP paths must use forward slashes: ${JSON.stringify(path)}.`);
  }
  const normalized = normalizeSafeZipPath(path);
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe ZIP path rejected: ${JSON.stringify(path)}.`);
  }
  return normalized;
}

function centralDirectoryFilter(limits: SafeZipLimits) {
  let entries = 0;
  let expanded = 0;
  const filePaths = new Set<string>();
  const directoryPaths = new Set<string>();

  return (entry: UnzipFileInfo): boolean => {
    entries += 1;
    if (entries > limits.maxEntries) {
      throw new Error(`ZIP contains too many entries (maximum ${limits.maxEntries}).`);
    }
    if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) {
      throw new Error(`ZIP entry has an invalid expanded size: ${JSON.stringify(entry.name)}.`);
    }
    expanded += entry.originalSize;
    if (expanded > limits.maxDecompressedBytes) {
      throw new Error(
        `Decompressed package exceeds maximum size of ${limits.maxDecompressedBytes} bytes.`,
      );
    }

    const isDirectory = entry.name.endsWith('/');
    const normalized = assertSafeZipPath(isDirectory ? entry.name.slice(0, -1) : entry.name);
    const canonical = normalized.toLowerCase();
    if (filePaths.has(canonical) || directoryPaths.has(canonical)) {
      throw new Error(`ZIP contains duplicate path: ${JSON.stringify(entry.name)}.`);
    }
    if (isDirectory) {
      if (entry.originalSize !== 0) {
        throw new Error(`ZIP directory has non-zero size: ${JSON.stringify(entry.name)}.`);
      }
      directoryPaths.add(canonical);
      return false;
    }
    const segments = canonical.split('/');
    let prefix = '';
    for (let index = 0; index < segments.length - 1; index += 1) {
      prefix = prefix ? `${prefix}/${segments[index]}` : segments[index]!;
      if (filePaths.has(prefix)) {
        throw new Error(`ZIP path conflicts with a file: ${JSON.stringify(entry.name)}.`);
      }
      directoryPaths.add(prefix);
    }
    if (directoryPaths.has(canonical)) {
      throw new Error(`ZIP file conflicts with a directory: ${JSON.stringify(entry.name)}.`);
    }
    filePaths.add(canonical);
    return true;
  };
}

/** Validate central-directory metadata before fflate inflates any entry. */
export function unzipSafe(
  compressedBytes: Uint8Array,
  limits: SafeZipLimits,
): Record<string, Uint8Array> {
  if (compressedBytes.byteLength === 0) throw new Error('Package is empty.');
  if (compressedBytes.byteLength > limits.maxCompressedBytes) {
    throw new Error(
      `Compressed package exceeds maximum size of ${limits.maxCompressedBytes} bytes.`,
    );
  }
  const files = unzipSync(compressedBytes, { filter: centralDirectoryFilter(limits) });
  const total = Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (total > limits.maxDecompressedBytes) {
    throw new Error(
      `Decompressed package exceeds maximum size of ${limits.maxDecompressedBytes} bytes.`,
    );
  }
  return files;
}
