import { mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// @ts-ignore The executable export module is intentionally plain Node ESM.
import {
  assertOutputOutsideRepository,
  exportCommunitySnapshot,
} from '../scripts/community-blob-export.mjs';

function pages(entries: Array<{ key: string; etag: string }>) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { blobs: entries.slice(0, 1), directories: [] };
      yield { blobs: entries.slice(1), directories: [] };
    },
  };
}

describe('read-only community Blob export', () => {
  it('exports all pages with byte hashes, Blob metadata, and migration-compatible JSON', async () => {
    const entries = [
      { key: 'meta/map.json', etag: 'json-etag' },
      { key: 'pkg/map.zip', etag: 'zip-etag' },
    ];
    const list = vi.fn(() => pages(entries));
    const getWithMetadata = vi.fn(async (key: string) => {
      const bytes =
        key === 'meta/map.json'
          ? new TextEncoder().encode('{"id":"map"}\n')
          : new Uint8Array([0, 255, 1]);
      return {
        data: bytes.buffer,
        etag: key === 'meta/map.json' ? 'json-etag' : 'zip-etag',
        metadata: { contentType: key.endsWith('.json') ? 'application/json' : 'application/zip' },
      };
    });

    const snapshot = await exportCommunitySnapshot(
      { list, getWithMetadata },
      {
        environment: 'production',
        storeName: 'community-production-v1',
        exportedAt: '2026-08-22T00:00:00.000Z',
      },
    );

    expect(list).toHaveBeenCalledTimes(2);
    expect(getWithMetadata).toHaveBeenCalledTimes(2);
    expect(snapshot.blobCount).toBe(2);
    expect(snapshot.blobs['meta/map.json']).toMatchObject({
      encoding: 'utf8',
      value: '{"id":"map"}\n',
      byteLength: 13,
      etag: 'json-etag',
      metadata: { contentType: 'application/json' },
    });
    expect(snapshot.blobs['pkg/map.zip']).toMatchObject({
      encoding: 'base64',
      value: 'AP8B',
      byteLength: 3,
      sha256: '47ffa3ea45a70b8a41c2c0825df323c00a8b7a01c1ea06083cc41dddcc001123',
    });
  });

  it('fails if a Blob changes during the export', async () => {
    const store = {
      list: vi.fn(() => pages([{ key: 'meta/map.json', etag: 'before' }])),
      getWithMetadata: vi.fn(async () => ({
        data: new TextEncoder().encode('{}').buffer,
        etag: 'after',
        metadata: {},
      })),
    };
    await expect(
      exportCommunitySnapshot(store, {
        environment: 'production',
        storeName: 'community-production-v1',
      }),
    ).rejects.toThrow('changed during export');
  });

  it('refuses to place backup data inside the repository', async () => {
    const repositoryRoot = await realpath(new URL('..', import.meta.url));
    await expect(
      assertOutputOutsideRepository(join(repositoryRoot, 'backup.json'), repositoryRoot),
    ).rejects.toThrow('outside the repository');

    const external = join(tmpdir(), `meridian-export-${Date.now()}`);
    await mkdir(external);
    await expect(
      assertOutputOutsideRepository(join(external, 'backup.json'), repositoryRoot),
    ).resolves.toBe(join(external, 'backup.json'));
  });
});
