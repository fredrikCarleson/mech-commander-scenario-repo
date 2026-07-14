const DANGEROUS_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.svg',
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.php',
  '.asp',
  '.aspx',
  '.jar',
  '.vbs',
  '.msi',
  '.dll',
  '.com',
  '.scr',
]);

export function normalizeZipEntryPath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/');
}

export function isUnsafeZipPath(entryPath: string): boolean {
  const normalized = normalizeZipEntryPath(entryPath);

  if (!normalized || normalized.includes('\0')) {
    return true;
  }

  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return true;
  }

  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      return true;
    }
  }

  return false;
}

export function getRootFileName(entryPath: string): string | null {
  const normalized = normalizeZipEntryPath(entryPath);
  if (isUnsafeZipPath(normalized)) {
    return null;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length !== 1) {
    return null;
  }

  return segments[0] ?? null;
}

export function hasDangerousExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

export function isValidWebp(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 12) {
    return false;
  }

  const riff = String.fromCharCode(buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!);
  const webp = String.fromCharCode(buffer[8]!, buffer[9]!, buffer[10]!, buffer[11]!);
  return riff === 'RIFF' && webp === 'WEBP';
}

export function isValidJsonExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.json');
}
