import { createHash } from 'node:crypto';
import { realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getStore } from '@netlify/blobs';

export const COMMUNITY_SNAPSHOT_VERSION = 1;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export async function assertOutputOutsideRepository(outputPath, repositoryRoot) {
  const [realRepositoryRoot, realOutputParent] = await Promise.all([
    realpath(repositoryRoot),
    realpath(dirname(resolve(outputPath))),
  ]);
  const resolvedOutput = resolve(realOutputParent, basename(outputPath));
  if (isInside(realRepositoryRoot, resolvedOutput)) {
    throw new Error('The Blob backup output must be outside the repository.');
  }
  return resolvedOutput;
}

async function listInventory(store) {
  const inventory = new Map();
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      if (inventory.has(blob.key)) throw new Error(`Blob inventory repeated key ${blob.key}.`);
      if (!blob.etag) throw new Error(`Blob inventory did not include an ETag for ${blob.key}.`);
      inventory.set(blob.key, blob.etag);
    }
  }
  return inventory;
}

function inventoriesMatch(first, second) {
  if (first.size !== second.size) return false;
  for (const [key, etag] of first) {
    if (second.get(key) !== etag) return false;
  }
  return true;
}

function encodeBlob(key, bytes, etag, metadata) {
  let encoding = 'base64';
  let value = Buffer.from(bytes).toString('base64');
  if (key.endsWith('.json')) {
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      JSON.parse(value);
      encoding = 'utf8';
    } catch {
      // Preserve malformed or non-UTF-8 .json payloads byte-for-byte as base64.
    }
  }
  return {
    encoding,
    value,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    etag,
    metadata,
  };
}

/**
 * Export every value from a read-only Netlify Blob Store handle.
 * The double inventory rejects an export if keys or ETags changed while it ran.
 */
export async function exportCommunitySnapshot(store, options) {
  const before = await listInventory(store);
  const blobs = {};
  for (const [key, listedEtag] of [...before.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const result = await store.getWithMetadata(key, {
      type: 'arrayBuffer',
      consistency: 'strong',
    });
    if (!result) throw new Error(`Blob ${key} disappeared during export.`);
    if (!result.etag || result.etag !== listedEtag) {
      throw new Error(`Blob ${key} changed during export.`);
    }
    const bytes = new Uint8Array(result.data);
    blobs[key] = encodeBlob(key, bytes, result.etag, result.metadata ?? {});
  }
  const after = await listInventory(store);
  if (!inventoriesMatch(before, after)) {
    throw new Error(
      'Blob inventory changed during export; discard the incomplete snapshot and retry.',
    );
  }
  return {
    schemaVersion: COMMUNITY_SNAPSHOT_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    environment: options.environment,
    store: options.storeName,
    blobCount: Object.keys(blobs).length,
    blobs,
  };
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

async function main(argv) {
  const storeName = argument(argv, '--store');
  const environment = argument(argv, '--environment');
  const output = argument(argv, '--output');
  if (!storeName || !environment || !output) {
    throw new Error(
      'Usage: npm run inventory:export -- --store <store> --environment <production|staging|development> --output <path-outside-repository>',
    );
  }
  if (!['production', 'staging', 'development'].includes(environment)) {
    throw new Error('--environment must be production, staging, or development.');
  }
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      'NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are required for read-only API access.',
    );
  }
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = await assertOutputOutsideRepository(output, repositoryRoot);
  const store = getStore({ name: storeName, siteID, token, consistency: 'strong' });
  const snapshot = await exportCommunitySnapshot(store, { environment, storeName });
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(outputPath, serialized, { flag: 'wx', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, blobCount: snapshot.blobCount, sha256: sha256(serialized) })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
