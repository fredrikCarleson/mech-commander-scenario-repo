import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { assertSafeZipPath, unzipSafe } from '../shared/validation/safe-zip.ts';

function limits(compressed: number, expanded: number, entries: number) {
  return {
    maxCompressedBytes: compressed,
    maxDecompressedBytes: expanded,
    maxEntries: entries,
  };
}

describe('safe ZIP policy boundaries', () => {
  it('accepts exact compressed, expanded, and entry limits', () => {
    const zip = zipSync({
      'first.bin': new Uint8Array([1, 2]),
      'second.bin': new Uint8Array([3, 4, 5]),
    });
    expect(Object.keys(unzipSafe(zip, limits(zip.byteLength, 5, 2)))).toHaveLength(2);
    expect(() => unzipSafe(zip, limits(zip.byteLength - 1, 5, 2))).toThrow(/Compressed/i);
    expect(() => unzipSafe(zip, limits(zip.byteLength, 4, 2))).toThrow(/Decompressed/i);
    expect(() => unzipSafe(zip, limits(zip.byteLength, 5, 1))).toThrow(/too many entries/i);
  });

  it('rejects traversal, absolute, drive, backslash, dot, empty, and NUL paths', () => {
    for (const path of [
      '../escape',
      '/absolute',
      'C:/drive',
      'folder\\file',
      'folder/./file',
      'folder//file',
      'nul\0file',
    ]) {
      expect(() => assertSafeZipPath(path), path).toThrow(/path/i);
    }
  });

  it('rejects case-insensitive duplicates and file/directory conflicts before extraction', () => {
    const duplicate = zipSync({ 'FILE.bin': new Uint8Array([1]), 'file.bin': new Uint8Array([2]) });
    expect(() => unzipSafe(duplicate, limits(duplicate.byteLength, 2, 2))).toThrow(/duplicate/i);

    const conflict = zipSync({
      folder: new Uint8Array([1]),
      'folder/child.bin': new Uint8Array([2]),
    });
    expect(() => unzipSafe(conflict, limits(conflict.byteLength, 2, 2))).toThrow(/conflicts/i);
  });

  it('rejects malformed archives and expansion bombs using central-directory sizes', () => {
    expect(() => unzipSafe(new Uint8Array([1, 2, 3]), limits(3, 3, 1))).toThrow();
    const compressed = zipSync({ 'large.bin': new Uint8Array(1025) }, { level: 9 });
    expect(() => unzipSafe(compressed, limits(compressed.byteLength, 1024, 1))).toThrow(
      /Decompressed/i,
    );
  });
});
