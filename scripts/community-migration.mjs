import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

export const COMMUNITY_SNAPSHOT_VERSION = 1;

function contentTypeForKey(key) {
  if (/^meta\/[0-9a-f-]+\.json$/i.test(key)) return 'scenario';
  if (/^campaigns\/meta\/[0-9a-f-]+\.json$/i.test(key)) return 'campaign';
  return undefined;
}

function idForKey(key) {
  return key.slice(key.lastIndexOf('/') + 1, -'.json'.length);
}

function keys(type, id, revision) {
  const root = type === 'scenario' ? '' : 'campaigns/';
  const revisionRoot = `revisions/${type === 'scenario' ? 'scenarios' : 'campaigns'}/${id}/${revision}`;
  return {
    package: `${root}pkg/${id}.zip`,
    thumbnail: `${root}thumb/${id}.webp`,
    revisionPackage: `${revisionRoot}/package.zip`,
    revisionThumbnail: `${revisionRoot}/thumbnail.webp`,
    release: `${revisionRoot}/release.json`,
    submission: `submissions/${type === 'scenario' ? 'scenarios' : 'campaigns'}/${id}.json`,
  };
}

function utf8Blob(value) {
  return { encoding: 'utf8', value: `${JSON.stringify(value, null, 2)}\n` };
}

function parseJsonBlob(blob, key) {
  if (!blob || blob.encoding !== 'utf8')
    throw new Error(`${key} must be a UTF-8 JSON snapshot blob.`);
  return JSON.parse(blob.value);
}

function sha256(blob) {
  const bytes = blobBytes(blob);
  return createHash('sha256').update(bytes).digest('hex');
}

function blobBytes(blob) {
  return blob.encoding === 'base64' ? Buffer.from(blob.value, 'base64') : Buffer.from(blob.value);
}

function campaignMissionIds(packageBlob, stableCampaignId) {
  let files;
  try {
    files = unzipSync(new Uint8Array(blobBytes(packageBlob)));
  } catch {
    throw new Error(`Legacy campaign ${stableCampaignId} package is not a readable ZIP.`);
  }
  const campaignPath = `Campaigns/${stableCampaignId}/campaign.json`;
  const campaignBytes = files[campaignPath];
  if (!campaignBytes)
    throw new Error(`Legacy campaign ${stableCampaignId} is missing ${campaignPath}.`);
  let campaign;
  try {
    campaign = JSON.parse(strFromU8(campaignBytes, true));
  } catch {
    throw new Error(`Legacy campaign ${stableCampaignId} has malformed campaign.json.`);
  }
  const missionIds = campaign?.missions?.map((mission) => mission?.scenarioId);
  if (
    !Array.isArray(missionIds) ||
    missionIds.length === 0 ||
    missionIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(missionIds).size !== missionIds.length
  ) {
    throw new Error(`Legacy campaign ${stableCampaignId} has invalid mission identities.`);
  }
  return missionIds;
}

/**
 * Plan additive legacy migration without mutating the supplied snapshot.
 * Legacy public keys and bytes remain untouched for forward/rollback compatibility.
 */
export function planCommunityMigration(snapshot) {
  if (snapshot?.schemaVersion !== COMMUNITY_SNAPSHOT_VERSION || !snapshot.blobs) {
    throw new Error(`Snapshot schemaVersion must be ${COMMUNITY_SNAPSHOT_VERSION}.`);
  }
  const writes = {};
  const records = [];
  for (const metadataKey of Object.keys(snapshot.blobs).sort()) {
    const contentType = contentTypeForKey(metadataKey);
    if (!contentType) continue;
    const id = idForKey(metadataKey);
    const original = parseJsonBlob(snapshot.blobs[metadataKey], metadataKey);
    if (original.id !== id) throw new Error(`${metadataKey} id does not match its key.`);
    const revision =
      original.revision ?? original.publishedRevision ?? original.pendingRevision ?? 1;
    const recordKeys = keys(contentType, id, revision);
    const hasPackage = !!snapshot.blobs[recordKeys.package];
    const hasThumbnail = !!snapshot.blobs[recordKeys.thumbnail];
    const approved =
      original.publicationStatus === 'published' ||
      (original.publicationStatus === 'archived' &&
        (!!original.publishedRevision ||
          !!original.releaseId ||
          original.availableRevisions?.length > 0));
    const legacyRejected = original.publicationStatus === 'archived' && !approved;
    const metadata = {
      ...original,
      revision,
      ...(approved ? { publishedRevision: revision } : { pendingRevision: revision }),
      ...(approved ? { releaseId: `${id}:r${revision}`, availableRevisions: [revision] } : {}),
    };
    const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(original);
    if (metadataChanged) writes[metadataKey] = utf8Blob(metadata);

    if (!hasPackage || !hasThumbnail) {
      throw new Error(
        `${contentType} ${id} cannot be migrated without its legacy package and thumbnail.`,
      );
    }
    if (sha256(snapshot.blobs[recordKeys.package]) !== original.checksumSha256) {
      throw new Error(`${contentType} ${id} package checksum does not match its legacy metadata.`);
    }
    if (!snapshot.blobs[recordKeys.revisionPackage]) {
      writes[recordKeys.revisionPackage] = structuredClone(snapshot.blobs[recordKeys.package]);
    } else if (
      sha256(snapshot.blobs[recordKeys.revisionPackage]) !==
      sha256(snapshot.blobs[recordKeys.package])
    ) {
      throw new Error(
        `${contentType} ${id} has a conflicting partially migrated revision package.`,
      );
    }
    if (!snapshot.blobs[recordKeys.revisionThumbnail]) {
      writes[recordKeys.revisionThumbnail] = structuredClone(snapshot.blobs[recordKeys.thumbnail]);
    } else if (
      sha256(snapshot.blobs[recordKeys.revisionThumbnail]) !==
      sha256(snapshot.blobs[recordKeys.thumbnail])
    ) {
      throw new Error(`${contentType} ${id} has a conflicting partially migrated thumbnail.`);
    }
    const orderedMissionIds =
      contentType === 'campaign'
        ? campaignMissionIds(snapshot.blobs[recordKeys.package], original.stableCampaignId)
        : undefined;

    if (approved) {
      if (!snapshot.blobs[recordKeys.release]) {
        writes[recordKeys.release] = utf8Blob({
          schemaVersion: 1,
          releaseId: `${id}:r${revision}`,
          id,
          ...(contentType === 'campaign'
            ? { stableCampaignId: original.stableCampaignId, orderedMissionIds }
            : {}),
          revision,
          metadata,
          approvedAt: original.updatedAt,
          approvedBySub: 'legacy-ownerless-migration',
        });
      }
    } else if (!snapshot.blobs[recordKeys.submission]) {
      writes[recordKeys.submission] = utf8Blob({
        schemaVersion: 1,
        id,
        revision,
        metadata,
        submittedAt: original.createdAt,
        ...(contentType === 'campaign' ? { orderedMissionIds } : {}),
        ...(legacyRejected
          ? {
              rejection: {
                reason: 'Legacy rejection; moderator reason unavailable.',
                moderatorSub: 'legacy-ownerless-migration',
                moderatedAt: original.updatedAt,
              },
            }
          : {}),
      });
    }
    if (contentType === 'campaign') {
      const claimKey = `claims/campaign-ids/${original.stableCampaignId}.json`;
      if (!snapshot.blobs[claimKey]) {
        writes[claimKey] = utf8Blob({
          schemaVersion: 1,
          stableCampaignId: original.stableCampaignId,
          repositoryId: id,
          ownerSub: 'legacy-ownerless-migration',
          initialChecksumSha256: original.checksumSha256,
          claimedAt: original.createdAt,
          state: approved && original.publicationStatus === 'archived' ? 'withdrawn' : 'active',
        });
      } else {
        const claim = parseJsonBlob(snapshot.blobs[claimKey], claimKey);
        if (claim.repositoryId !== id || claim.stableCampaignId !== original.stableCampaignId) {
          throw new Error(`Campaign ${id} has a conflicting stable-ID claim.`);
        }
      }
    }
    records.push({
      contentType,
      id,
      publicationStatus: original.publicationStatus,
      revision,
      ownerless: !snapshot.blobs[`ownership/${contentType}s/${id}.json`],
      disposition: approved ? 'approved' : legacyRejected ? 'legacy-rejected' : 'pending',
      metadataChanged,
    });
  }
  const sourceHashes = Object.fromEntries(
    Object.entries(snapshot.blobs).map(([key, blob]) => [key, sha256(blob)]),
  );
  return {
    schemaVersion: COMMUNITY_SNAPSHOT_VERSION,
    dryRun: true,
    records,
    proposedWriteCount: Object.keys(writes).length,
    writes,
    sourceHashes,
  };
}

export function applyMigrationPlan(snapshot, plan) {
  return {
    schemaVersion: COMMUNITY_SNAPSHOT_VERSION,
    blobs: { ...structuredClone(snapshot.blobs), ...structuredClone(plan.writes) },
  };
}

async function main(argv) {
  const inputFlag = argv.indexOf('--input');
  const outputFlag = argv.indexOf('--output');
  if (inputFlag < 0 || !argv[inputFlag + 1]) {
    throw new Error(
      'Usage: npm run migration:dry-run -- --input <snapshot.json> [--output <local-migrated-snapshot.json>]',
    );
  }
  const inputPath = argv[inputFlag + 1];
  const snapshot = JSON.parse(await readFile(inputPath, 'utf8'));
  const plan = planCommunityMigration(snapshot);
  process.stdout.write(
    `${JSON.stringify({ ...plan, writes: Object.keys(plan.writes) }, null, 2)}\n`,
  );
  if (outputFlag >= 0) {
    const outputPath = argv[outputFlag + 1];
    if (!outputPath) throw new Error('--output requires a local path.');
    await writeFile(
      outputPath,
      `${JSON.stringify(applyMigrationPlan(snapshot, plan), null, 2)}\n`,
      {
        flag: 'wx',
      },
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
