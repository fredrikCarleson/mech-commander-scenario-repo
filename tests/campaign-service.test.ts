import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MINIMAL_WEBP } from '../fixtures/build-fixtures.ts';
import { CampaignService } from '../netlify/functions/lib/campaign-service.ts';
import type { CampaignBlobStore } from '../netlify/functions/lib/campaign-blob-store.ts';
import { InMemoryCampaignBlobStore } from '../netlify/functions/lib/netlify-campaign-blob-store.ts';
import { validateCampaignPackage } from '../shared/validation/campaign-package-validator.ts';

const CREATOR = { sub: 'campaign-owner-sub', email: 'author@example.com' };
const ADMIN = { sub: 'campaign-admin-sub', email: 'admin@example.com' };

async function buildCampaignZip(
  options: {
    stableCampaignId?: string;
    title?: string;
    missionCountOverride?: number;
    omitScenario?: boolean;
    includeVideoField?: boolean;
    mediaManifest?: unknown;
    extraFiles?: Record<string, Uint8Array | string>;
  } = {},
): Promise<Uint8Array> {
  const stableCampaignId = options.stableCampaignId ?? 'custom-border-fire';
  const scenarioId = 'custom-border-fire-mission-1';
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      schemaVersion: '1.0.0',
      stableCampaignId,
      title: options.title ?? 'Border Fire',
      tagline: 'A measured first community campaign.',
      author: 'Test Author',
      gameVersion: '1.1.0',
      campaignFormatVersion: '2.0.0',
      difficulty: 'regular',
      missionCount: options.missionCountOverride ?? 1,
      estimatedPlayTimeMinutes: 45,
      tags: ['linear', 'desert'],
    }),
  );
  zip.file('thumbnail.webp', MINIMAL_WEBP);
  zip.file(
    `Campaigns/${stableCampaignId}/campaign.json`,
    JSON.stringify({
      version: 2,
      id: stableCampaignId,
      name: options.title ?? 'Border Fire',
      tagline: 'A measured first community campaign.',
      author: { displayName: 'Test Author' },
      designTargets: { difficulty: 'regular', experience: 'A concise tactical arc.' },
      defaultCompanyName: 'Border Company',
      startingFunds: 250000,
      startingReputation: 0,
      startingMachines: ['WISP-20'],
      missions: [{ scenarioId, opCode: 'BF-01' }],
      intro: {
        slides: [{ id: 'intro-1', kicker: '', title: 'Orders', body: 'Deploy.' }],
        ...(options.includeVideoField ? { videoSrc: 'media/intro.mp4' } : {}),
      },
    }),
  );
  if (!options.omitScenario) {
    zip.file(
      `Campaigns/${stableCampaignId}/missions/${scenarioId}/scenario.json`,
      JSON.stringify({
        version: 1,
        id: scenarioId,
        name: 'Border Patrol',
        description: 'Secure the border route.',
        environment: 'Dust basin',
        biome: 'desert',
        massLimit: 180,
        objective: { kind: 'destroyAll', description: 'Destroy all hostiles.' },
        grid: {
          width: 6,
          height: 6,
          rows: ['......', '......', '......', '......', '......', '......'],
          overrides: {},
        },
        playerDeployZone: [{ x: 0, y: 0 }],
        enemyForce: [{ chassisId: 'WISP-20', skill: 2, pos: { x: 5, y: 5 } }],
      }),
    );
    zip.file(`Campaigns/${stableCampaignId}/missions/${scenarioId}/scenariomap.webp`, MINIMAL_WEBP);
  }
  if (options.mediaManifest) {
    zip.file(
      `Campaigns/${stableCampaignId}/media/manifest.json`,
      JSON.stringify(options.mediaManifest),
    );
  }
  for (const [path, contents] of Object.entries(options.extraFiles ?? {})) {
    zip.file(path, contents);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function failOnce(
  base: InMemoryCampaignBlobStore,
  method: keyof CampaignBlobStore,
): CampaignBlobStore {
  let failed = false;
  return new Proxy(base, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === method) {
        return async (...args: unknown[]) => {
          if (!failed) {
            failed = true;
            throw new Error(`injected ${String(method)} failure`);
          }
          return value.apply(target, args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as CampaignBlobStore;
}

describe('campaign package validation', () => {
  it('accepts a complete self-contained campaign', async () => {
    const result = await validateCampaignPackage(await buildCampaignZip());
    expect(result.ok).toBe(true);
  });

  it('rejects a manifest count mismatch and missing embedded mission', async () => {
    const result = await validateCampaignPackage(
      await buildCampaignZip({ missionCountOverride: 2, omitScenario: true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/missionCount|Missing embedded/);
  });

  it('rejects custom/community video fields', async () => {
    const result = await validateCampaignPackage(
      await buildCampaignZip({ includeVideoField: true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/video/i);
  });

  it('rejects attempts to publish with a reserved official-style campaign identity', async () => {
    const result = await validateCampaignPackage(
      await buildCampaignZip({ stableCampaignId: 'meridian_strike' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/manifest|stableCampaignId/i);
  });

  it('rejects video roles, MIME/signature disagreement, dangerous files, and malformed missions', async () => {
    const videoRole = await validateCampaignPackage(
      await buildCampaignZip({
        mediaManifest: {
          version: 1,
          assets: [{ role: 'intro-video', fileName: 'fake.png', mimeType: 'image/png' }],
        },
        extraFiles: { 'Campaigns/custom-border-fire/media/fake.png': MINIMAL_WEBP },
      }),
    );
    expect(videoRole.ok).toBe(false);
    if (!videoRole.ok) expect(videoRole.errors.join(' ')).toMatch(/manifest|role/i);

    const mimeMismatch = await validateCampaignPackage(
      await buildCampaignZip({
        mediaManifest: {
          version: 1,
          assets: [{ role: 'theater-art', fileName: 'fake.png', mimeType: 'image/png' }],
        },
        extraFiles: { 'Campaigns/custom-border-fire/media/fake.png': MINIMAL_WEBP },
      }),
    );
    expect(mimeMismatch.ok).toBe(false);
    if (!mimeMismatch.ok) expect(mimeMismatch.errors.join(' ')).toMatch(/image\/webp|validation/i);

    const dangerous = await validateCampaignPackage(
      await buildCampaignZip({
        extraFiles: { 'Campaigns/custom-border-fire/payload.exe': new Uint8Array([1]) },
      }),
    );
    expect(dangerous.ok).toBe(false);
    if (!dangerous.ok) expect(dangerous.errors.join(' ')).toMatch(/dangerous|Unexpected/i);

    const malformedZip = await JSZip.loadAsync(await buildCampaignZip());
    malformedZip.file(
      'Campaigns/custom-border-fire/missions/custom-border-fire-mission-1/scenario.json',
      JSON.stringify({ version: 1, id: 'custom-border-fire-mission-1' }),
    );
    const malformed = await validateCampaignPackage(
      await malformedZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    );
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.errors.join(' ')).toMatch(/validation/i);
  });
});

describe('campaign service revisions', () => {
  let service: CampaignService;

  beforeEach(() => {
    service = new CampaignService(new InMemoryCampaignBlobStore());
  });

  it('publishes only after approval', async () => {
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    expect(draft.publicationStatus).toBe('draft');
    expect((await service.listCampaigns({})).total).toBe(0);
    expect(await service.getCampaign(draft.id)).toBeNull();
    expect(await service.getCampaignRelease(draft.id, 1)).toBeNull();
    expect(await service.downloadCampaign(draft.id)).toBeNull();
    expect(await service.downloadCampaign(draft.id, 1)).toBeNull();
    const published = await service.approveCampaign(draft.id, 1, ADMIN);
    expect(published.publishedRevision).toBe(1);
    expect((await service.listCampaigns({})).items[0]?.title).toBe('Border Fire');
  });

  it('keeps the approved revision live while revision two is reviewed', async () => {
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    await service.approveCampaign(draft.id, 1, ADMIN);
    const pending = await service.updateCampaign(
      draft.id,
      await buildCampaignZip({ title: 'Border Fire Revised' }),
      CREATOR,
    );
    expect(pending.revision).toBe(2);
    expect(pending.publishedRevision).toBe(1);
    expect((await service.listCampaigns({})).items[0]?.title).toBe('Border Fire');
    await service.approveCampaign(draft.id, 2, ADMIN);
    expect((await service.listCampaigns({})).items[0]?.title).toBe('Border Fire Revised');
  });

  it('keeps downloads available when the non-critical counter write fails', async () => {
    const store = new InMemoryCampaignBlobStore();
    const base = new CampaignService(store);
    const draft = await base.uploadCampaign(await buildCampaignZip(), CREATOR);
    await base.approveCampaign(draft.id, 1, ADMIN);
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await new CampaignService(failOnce(store, 'setMetadata')).downloadCampaign(
      draft.id,
    );
    expect(result?.packageBytes.byteLength).toBeGreaterThan(0);
    await vi.waitFor(() => expect(warned).toHaveBeenCalled());
  });

  it('rejects non-owner updates and duplicate stable IDs', async () => {
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    await expect(
      service.updateCampaign(draft.id, await buildCampaignZip(), {
        sub: 'other-sub',
        email: 'other@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.uploadCampaign(await buildCampaignZip(), {
        sub: 'other-sub',
        email: 'other@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps bounded rejection audit details private to the owner status path', async () => {
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    await service.rejectCampaign(draft.id, 1, 'Replace the thumbnail.', ADMIN);
    await expect(service.getSubmissionStatus(draft.id, CREATOR)).resolves.toMatchObject({
      publicationStatus: 'archived',
      rejection: {
        reason: 'Replace the thumbnail.',
        moderatorSub: ADMIN.sub,
        moderatedAt: expect.any(String),
      },
    });
    await expect(
      service.rejectCampaign(draft.id, 1, 'x'.repeat(1001), ADMIN),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('archives an owner withdrawal without deleting revision history', async () => {
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    await service.approveCampaign(draft.id, 1, ADMIN);
    const archived = await service.withdrawCampaign(draft.id, CREATOR);
    expect(archived.publicationStatus).toBe('archived');
    expect((await service.listCampaigns({})).total).toBe(0);
    expect(await service.downloadCampaign(draft.id, 1)).not.toBeNull();
  });

  it('withdraws a pending update without replacing the last published metadata', async () => {
    const store = new InMemoryCampaignBlobStore();
    const service = new CampaignService(store);
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    await service.approveCampaign(draft.id, 1, ADMIN);
    await service.updateCampaign(
      draft.id,
      await buildCampaignZip({ title: 'Unapproved Replacement' }),
      CREATOR,
    );

    const archived = await service.withdrawCampaign(draft.id, CREATOR);

    expect(archived.title).toBe('Unapproved Replacement');
    expect((await store.getMetadata(draft.id))?.title).toBe('Border Fire');
    expect((await store.getMetadata(draft.id))?.publicationStatus).toBe('archived');
    expect(await service.getCampaign(draft.id)).toBeNull();
    expect(await service.downloadCampaign(draft.id, 1)).not.toBeNull();
  });

  it('atomically reserves stable ids across independent service instances', async () => {
    const store = new InMemoryCampaignBlobStore();
    const first = new CampaignService(store);
    const second = new CampaignService(store);
    const bytes = await buildCampaignZip();
    const results = await Promise.allSettled([
      first.uploadCampaign(bytes, CREATOR),
      second.uploadCampaign(bytes, { sub: 'other-owner', email: 'other@example.com' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('makes same-owner upload retries idempotent after every write step', async () => {
    const methods: (keyof CampaignBlobStore)[] = [
      'setStableIdClaim',
      'setRevisionPackage',
      'setRevisionThumbnail',
      'setOwnership',
      'setSubmission',
      'setRatings',
    ];
    for (const method of methods) {
      const store = new InMemoryCampaignBlobStore();
      const stableCampaignId = `custom-retry-${method.toLowerCase()}`;
      const bytes = await buildCampaignZip({ stableCampaignId });
      await expect(
        new CampaignService(failOnce(store, method)).uploadCampaign(bytes, CREATOR),
      ).rejects.toThrow(/injected/);
      const recovered = await new CampaignService(store).uploadCampaign(bytes, CREATOR);
      expect(recovered.stableCampaignId).toBe(stableCampaignId);
      expect(await new CampaignService(store).listPendingCampaigns()).toHaveLength(1);
    }
  });

  it('allows only one concurrent revision update to claim the next revision', async () => {
    const store = new InMemoryCampaignBlobStore();
    const first = new CampaignService(store);
    const second = new CampaignService(store);
    const draft = await first.uploadCampaign(await buildCampaignZip(), CREATOR);
    await first.approveCampaign(draft.id, 1, ADMIN);
    const bytes = await buildCampaignZip({ title: 'Concurrent revision' });
    const results = await Promise.allSettled([
      first.updateCampaign(draft.id, bytes, CREATOR),
      second.updateCampaign(draft.id, bytes, CREATOR),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await first.listPendingCampaigns())[0]?.revision).toBe(2);
  });

  it('serializes concurrent approve, reject, and withdraw commands for one revision', async () => {
    const store = new InMemoryCampaignBlobStore();
    const draft = await new CampaignService(store).uploadCampaign(
      await buildCampaignZip(),
      CREATOR,
    );
    const results = await Promise.allSettled([
      new CampaignService(store).approveCampaign(draft.id, 1, ADMIN),
      new CampaignService(store).rejectCampaign(draft.id, 1, 'Concurrent rejection.', ADMIN),
      new CampaignService(store).withdrawCampaign(draft.id, CREATOR),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expect(fulfilled).toBeLessThanOrEqual(2);
    expect(results.filter((result) => result.status === 'rejected').length).toBeGreaterThanOrEqual(
      1,
    );
    const submission = await store.getSubmission(draft.id);
    expect(['published', 'archived']).toContain(submission?.metadata.publicationStatus);
    expect(
      (await new CampaignService(store).getCampaign(draft.id))?.publicationStatus ?? 'archived',
    ).toBe(submission?.metadata.publicationStatus);
  });

  it('blocks withdrawal while an approved pointer is between activation and publication', async () => {
    const store = new InMemoryCampaignBlobStore();
    const base = new CampaignService(store);
    const draft = await base.uploadCampaign(await buildCampaignZip(), CREATOR);
    let releasePointer!: () => void;
    const pointerGate = new Promise<void>((resolve) => {
      releasePointer = resolve;
    });
    const paused = new Proxy(store, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property === 'setMetadata') {
          return async (...args: unknown[]) => {
            await pointerGate;
            return value.apply(target, args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as CampaignBlobStore;
    const approving = new CampaignService(paused).approveCampaign(draft.id, 1, ADMIN);
    await vi.waitFor(async () => {
      expect((await store.getSubmission(draft.id))?.activation?.revision).toBe(1);
    });
    await expect(base.withdrawCampaign(draft.id, CREATOR)).rejects.toMatchObject({
      statusCode: 409,
    });
    releasePointer();
    await expect(approving).resolves.toMatchObject({ publicationStatus: 'published' });
  });

  it('keeps the old pointer live after injected approval failures and supports retry', async () => {
    const methods: (keyof CampaignBlobStore)[] = [
      'setRelease',
      'setPackage',
      'setThumbnail',
      'setSubmission',
      'setMetadata',
    ];
    for (const method of methods) {
      const store = new InMemoryCampaignBlobStore();
      const base = new CampaignService(store);
      const draft = await base.uploadCampaign(
        await buildCampaignZip({ stableCampaignId: `custom-approval-${method.toLowerCase()}` }),
        CREATOR,
      );
      await expect(
        new CampaignService(failOnce(store, method)).approveCampaign(draft.id, 1, ADMIN),
      ).rejects.toThrow(/injected/);
      expect(await base.getCampaign(draft.id)).toBeNull();
      await expect(base.approveCampaign(draft.id, 1, ADMIN)).resolves.toMatchObject({
        publicationStatus: 'published',
        publishedRevision: 1,
      });
    }
  });

  it('rolls the public pointer back without removing newer immutable releases', async () => {
    const store = new InMemoryCampaignBlobStore();
    const service = new CampaignService(store);
    const revisionOneBytes = await buildCampaignZip();
    const draft = await service.uploadCampaign(revisionOneBytes, CREATOR);
    await service.approveCampaign(draft.id, 1, ADMIN);
    const revisionTwoBytes = await buildCampaignZip({ title: 'Border Fire Revision Two' });
    await service.updateCampaign(draft.id, revisionTwoBytes, CREATOR);
    await service.approveCampaign(draft.id, 2, ADMIN);
    await service.withdrawCampaign(draft.id, CREATOR);
    expect((await store.getStableIdClaim('custom-border-fire'))?.state).toBe('withdrawn');

    const rolledBack = await service.rollbackCampaign(draft.id, 1, ADMIN);
    expect(rolledBack.title).toBe('Border Fire');
    expect(rolledBack.publishedRevision).toBe(1);
    expect(rolledBack.availableRevisions).toEqual([1, 2]);
    expect(await service.downloadCampaign(draft.id, 2)).not.toBeNull();
    expect((await store.getStableIdClaim('custom-border-fire'))?.state).toBe('active');
    const revisionThree = await service.updateCampaign(
      draft.id,
      await buildCampaignZip({ title: 'Border Fire Revision Three' }),
      CREATOR,
    );
    expect(revisionThree.revision).toBe(3);
  });

  it('tombstones public routes while retaining immutable release blobs', async () => {
    const store = new InMemoryCampaignBlobStore();
    const service = new CampaignService(store);
    const draft = await service.uploadCampaign(await buildCampaignZip(), CREATOR);
    await service.approveCampaign(draft.id, 1, ADMIN);
    await service.deleteCampaign(draft.id, ADMIN);
    expect(await service.getCampaign(draft.id)).toBeNull();
    expect(await service.downloadCampaign(draft.id, 1)).toBeNull();
    expect(await store.getRelease(draft.id, 1)).not.toBeNull();
    expect(await store.getRevisionPackage(draft.id, 1)).not.toBeNull();
  });
});
