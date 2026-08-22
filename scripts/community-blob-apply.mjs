import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getStore } from '@netlify/blobs';
import { planCommunityMigration } from './community-migration.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

function blobBytes(blob) {
  return blob.encoding === 'base64' ? Buffer.from(blob.value, 'base64') : Buffer.from(blob.value);
}

function contentTypeForKey(key) {
  if (key.endsWith('.json')) return 'application/json';
  if (key.endsWith('.zip')) return 'application/zip';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function writeRank(key) {
  if (key.endsWith('/package.zip') || key.endsWith('/thumbnail.webp')) return 0;
  if (key.startsWith('submissions/') || key.endsWith('/release.json') || key.startsWith('claims/')) {
    return 1;
  }
  if (key.startsWith('meta/') || key.startsWith('campaigns/meta/')) return 2;
  return 1;
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

async function requireMatchingBytes(store, key, expectedHash) {
  const result = await store.getWithMetadata(key, {
    type: 'arrayBuffer',
    consistency: 'strong',
  });
  if (!result) throw new Error(`Blob ${key} was missing after a conditional write.`);
  const actual = sha256(new Uint8Array(result.data));
  if (actual !== expectedHash) {
    throw new Error(`Blob ${key} did not match the planned SHA-256 after write.`);
  }
  return result.etag;
}

async function main(argv) {
  const storeName = argument(argv, '--store');
  const environment = argument(argv, '--environment');
  const input = argument(argv, '--input');
  const confirm = argument(argv, '--confirm');
  if (!storeName || !environment || !input || !confirm) {
    throw new Error(
      'Usage: node scripts/community-blob-apply.mjs --store <store> --environment production --input <snapshot.json> --confirm production',
    );
  }
  if (environment !== 'production' || confirm !== 'production') {
    throw new Error('Refusing to apply: --environment and --confirm must both be production.');
  }
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error('NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are required for Blob writes.');
  }

  const snapshot = JSON.parse(await readFile(input, 'utf8'));
  if (snapshot.store && snapshot.store !== storeName) {
    throw new Error(`Snapshot store ${snapshot.store} does not match --store ${storeName}.`);
  }
  if (snapshot.environment && snapshot.environment !== environment) {
    throw new Error(
      `Snapshot environment ${snapshot.environment} does not match --environment ${environment}.`,
    );
  }
  const plan = planCommunityMigration(snapshot);
  const store = getStore({ name: storeName, siteID, token, consistency: 'strong' });
  const live = await listInventory(store);

  for (const [key, snapshotBlob] of Object.entries(snapshot.blobs)) {
    const liveEtag = live.get(key);
    if (!liveEtag) throw new Error(`Live store is missing backup key ${key}.`);
    if (liveEtag !== snapshotBlob.etag) {
      throw new Error(`Live blob ${key} changed since the backup; refuse to apply.`);
    }
  }
  for (const key of live.keys()) {
    if (snapshot.blobs[key] || plan.writes[key]) continue;
    throw new Error(`Live store has unexpected key ${key} that is not in the backup or plan.`);
  }

  const created = [];
  const updated = [];
  const alreadyPresent = [];
  const orderedKeys = Object.keys(plan.writes).sort(
    (a, b) => writeRank(a) - writeRank(b) || a.localeCompare(b),
  );

  for (const key of orderedKeys) {
    const planned = plan.writes[key];
    const bytes = blobBytes(planned);
    const expectedHash = sha256(bytes);
    const existedInBackup = Boolean(snapshot.blobs[key]);
    const condition = existedInBackup
      ? { onlyIfMatch: snapshot.blobs[key].etag }
      : { onlyIfNew: true };
    const metadata = {
      ...(snapshot.blobs[key]?.metadata ?? {}),
      contentType: snapshot.blobs[key]?.metadata?.contentType ?? contentTypeForKey(key),
    };
    const result = await store.set(key, bytes, { metadata, ...condition });
    if (result?.modified === false) {
      await requireMatchingBytes(store, key, expectedHash);
      alreadyPresent.push(key);
      continue;
    }
    await requireMatchingBytes(store, key, expectedHash);
    if (existedInBackup) updated.push(key);
    else created.push(key);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        store: storeName,
        environment,
        proposedWriteCount: plan.proposedWriteCount,
        created: created.length,
        updated: updated.length,
        alreadyPresent: alreadyPresent.length,
        createdKeys: created,
        updatedKeys: updated,
        alreadyPresentKeys: alreadyPresent,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
