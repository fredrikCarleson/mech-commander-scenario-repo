import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { campaignMetadataSchema, campaignReleaseSchema } from '../shared/schemas/campaign.ts';
import { scenarioMetadataSchema, scenarioReleaseSchema } from '../shared/schemas/metadata.ts';
import {
  COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES,
  COMMUNITY_MAX_CAMPAIGN_ZIP_ENTRIES,
  COMMUNITY_MAX_COMPRESSED_BYTES,
  COMMUNITY_MAX_DECOMPRESSED_BYTES,
  COMMUNITY_MAX_IMAGE_DIMENSION,
  COMMUNITY_MAX_SCENARIO_ZIP_ENTRIES,
  COMMUNITY_PACKAGE_POLICY_VERSION,
} from '../shared/constants.ts';
import { validateCampaignPackage } from '../shared/validation/campaign-package-validator.ts';
import { validateScenarioPackage } from '../shared/validation/package-validator.ts';

async function fixture(): Promise<any> {
  return JSON.parse(
    await readFile(new URL('./fixtures/contract-v1.json', import.meta.url), 'utf8'),
  );
}

function imageBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

describe('versioned cross-repository contract fixture', () => {
  it('is produced by the real community metadata schemas and scenario validator', async () => {
    const value = await fixture();
    expect(value.fixtureSchemaVersion).toBe('community-contract/v1');
    expect(scenarioMetadataSchema.parse(value.scenario.metadata).releaseId).toMatch(/:r1$/);
    expect(
      scenarioReleaseSchema.parse({ ...value.scenario.release, metadata: value.scenario.metadata })
        .releaseId,
    ).toBe(value.scenario.revisionDownloadHeaders['X-Community-Release-Id']);
    expect(value.scenario.revisionDownloadHeaders['X-Checksum-Sha256']).toBe(
      value.scenario.metadata.checksumSha256,
    );
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(value.scenario.manifest));
    zip.file('scenario.json', JSON.stringify(value.scenario.scenario));
    zip.file('map.json', JSON.stringify(value.scenario.map));
    zip.file('thumbnail.webp', imageBytes(value.minimalWebpBase64));
    await expect(
      validateScenarioPackage(await zip.generateAsync({ type: 'uint8array' })),
    ).resolves.toMatchObject({ ok: true });
  });

  it('is produced by the real community campaign schema and deep package validator', async () => {
    const value = await fixture();
    expect(campaignMetadataSchema.parse(value.campaign.metadata).stableCampaignId).toBe(
      'custom-contract-campaign',
    );
    expect(
      campaignReleaseSchema.parse({ ...value.campaign.release, metadata: value.campaign.metadata })
        .orderedMissionIds,
    ).toEqual(['custom-contract-mission']);
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(value.campaign.manifest));
    zip.file('thumbnail.webp', imageBytes(value.minimalWebpBase64));
    const root = 'Campaigns/custom-contract-campaign/';
    zip.file(`${root}campaign.json`, JSON.stringify(value.campaign.campaign));
    zip.file(
      `${root}missions/custom-contract-mission/scenario.json`,
      JSON.stringify({
        ...value.scenario.scenario,
        grid: value.scenario.map,
      }),
    );
    zip.file(
      `${root}missions/custom-contract-mission/scenariomap.webp`,
      imageBytes(value.minimalWebpBase64),
    );
    const validation = await validateCampaignPackage(
      await zip.generateAsync({ type: 'uint8array' }),
    );
    expect(validation.ok, validation.ok ? undefined : validation.errors.join('\n')).toBe(true);
    expect(value.lifecycle).toEqual({
      withdrawn: { publicationStatus: 'archived', revisionSpecificRetrieval: true },
      deleted: { httpStatus: 410, publicRevisionRetrieval: false, immutableRetention: true },
    });
  });

  it('freezes the shared package policy and native/legacy path contracts', async () => {
    const value = await fixture();
    expect(value.packagePolicy).toEqual({
      version: COMMUNITY_PACKAGE_POLICY_VERSION,
      maxCompressedBytes: COMMUNITY_MAX_COMPRESSED_BYTES,
      maxExpandedBytes: COMMUNITY_MAX_DECOMPRESSED_BYTES,
      maxImageBytes: COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES,
      scenarioEntryLimit: COMMUNITY_MAX_SCENARIO_ZIP_ENTRIES,
      campaignEntryLimit: COMMUNITY_MAX_CAMPAIGN_ZIP_ENTRIES,
      maxImageDimension: COMMUNITY_MAX_IMAGE_DIMENSION,
      communityVideoAllowed: false,
    });
    expect(value.layouts.nativeScenario).toEqual([
      'manifest.json',
      'scenario.json',
      'map.json',
      'thumbnail.webp',
    ]);
    expect(value.layouts.legacyScenario[0]).toMatch(/^Scenarios\//);
    expect(value.layouts.legacyCampaignScenarioRoot).toBe('Scenarios/');
  });
});
