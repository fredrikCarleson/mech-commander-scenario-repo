import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScenarioZip } from '../fixtures/build-fixtures.ts';
import { InMemoryBlobStore } from '../netlify/functions/lib/netlify-blob-store.ts';
import type { ScenarioBlobStore } from '../netlify/functions/lib/blob-store.ts';
import { ScenarioService, ServiceError } from '../netlify/functions/lib/scenario-service.ts';

const CREATOR = { sub: 'google-sub-creator', email: 'creator@example.com' };
const ADMIN = { sub: 'google-sub-admin', email: 'admin@example.com' };

function failOnce(base: InMemoryBlobStore, method: keyof ScenarioBlobStore): ScenarioBlobStore {
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
  }) as ScenarioBlobStore;
}

describe('scenario service', () => {
  let store: InMemoryBlobStore;
  let service: ScenarioService;

  beforeEach(() => {
    store = new InMemoryBlobStore();
    service = new ScenarioService(store);
  });

  it('uploads a valid package as draft and lists it after approval', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes, CREATOR);
    expect(metadata.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(metadata.publicationStatus).toBe('draft');

    const listBefore = await service.listScenarios({});
    expect(listBefore.total).toBe(0);
    expect(await service.getScenario(metadata.id)).toBeNull();
    expect(await service.getScenarioRelease(metadata.id, 1)).toBeNull();
    expect(await service.downloadScenario(metadata.id)).toBeNull();
    expect(await service.downloadScenario(metadata.id, 1)).toBeNull();
    expect(await service.getThumbnail(metadata.id, 1)).toBeNull();

    await service.approveScenario(metadata.id, 1, ADMIN);
    const list = await service.listScenarios({});
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe('Urban Night Raid');
  });

  it('filters scenarios by difficulty and max tonnage', async () => {
    const veteran = await buildScenarioZip();
    const recruit = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: 'Training Sortie',
        description: 'Intro scenario for new commanders.',
        author: 'Instructor',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'recruit',
        recommendedTonnage: 1200,
        maximumTonnage: 1800,
        estimatedPlayTimeMinutes: 20,
        tags: ['training'],
      },
    });

    await service.uploadScenario(veteran, CREATOR);
    await service.uploadScenario(recruit, CREATOR);
    await service.approveScenario((await service.listPendingScenarios())[0]!.id, 1, ADMIN);
    await service.approveScenario((await service.listPendingScenarios())[0]!.id, 1, ADMIN);

    const filtered = await service.listScenarios({
      difficulty: 'recruit',
      maxTonnage: '2000',
    });

    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.difficulty).toBe('recruit');
  });

  it('replaces ratings from the same client ID', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes, CREATOR);
    await service.approveScenario(metadata.id, 1, ADMIN);
    const clientId = '550e8400-e29b-41d4-a716-446655440000';

    await service.submitRating(metadata.id, { clientId, rating: 3 });
    const first = await service.getScenario(metadata.id);
    expect(first?.ratingCount).toBe(1);
    expect(first?.averageRating).toBe(3);

    await service.submitRating(metadata.id, { clientId, rating: 5 });
    const second = await service.getScenario(metadata.id);
    expect(second?.ratingCount).toBe(1);
    expect(second?.averageRating).toBe(5);
  });

  it('keeps downloads available when the non-critical counter write fails', async () => {
    const metadata = await service.uploadScenario(await buildScenarioZip(), CREATOR);
    await service.approveScenario(metadata.id, 1, ADMIN);
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await new ScenarioService(failOnce(store, 'setMetadata')).downloadScenario(
      metadata.id,
    );
    expect(result?.packageBytes.byteLength).toBeGreaterThan(0);
    await vi.waitFor(() => expect(warned).toHaveBeenCalled());
  });

  it('rejects invalid upload packages', async () => {
    const zipBytes = await buildScenarioZip({ omit: ['map.json'] });
    await expect(service.uploadScenario(zipBytes, CREATOR)).rejects.toBeInstanceOf(ServiceError);
  });

  it('updates an existing scenario package in place', async () => {
    const zipBytes = await buildScenarioZip();
    const created = await service.uploadScenario(zipBytes, CREATOR);
    await service.approveScenario(created.id, 1, ADMIN);
    await service.submitRating(created.id, {
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      rating: 4,
    });

    const updatedZip = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: 'Urban Night Raid Revised',
        description: 'Updated night operation.',
        author: 'Captain Vance',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'veteran',
        recommendedTonnage: 3600,
        maximumTonnage: 4800,
        estimatedPlayTimeMinutes: 55,
        tags: ['urban', 'night', 'revised'],
      },
    });

    const updated = await service.updateScenario(created.id, updatedZip, CREATOR);
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('Urban Night Raid Revised');
    expect(updated.ratingCount).toBe(1);
    expect(updated.averageRating).toBe(4);
    expect(updated.downloadCount).toBe(created.downloadCount);
    expect(updated.publicationStatus).toBe('draft');

    const list = await service.listScenarios({});
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe('Urban Night Raid');
    expect(await service.listPendingScenarios()).toHaveLength(1);
  });

  it('rejects pending scenarios and keeps them out of the catalogue', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes, CREATOR);
    const rejected = await service.rejectScenario(metadata.id, 1, 'Package needs revision.', ADMIN);
    expect(rejected.publicationStatus).toBe('archived');
    await expect(service.getSubmissionStatus(metadata.id, CREATOR)).resolves.toMatchObject({
      rejection: {
        reason: 'Package needs revision.',
        moderatorSub: ADMIN.sub,
        moderatedAt: expect.any(String),
      },
    });

    const list = await service.listScenarios({});
    expect(list.total).toBe(0);
    expect(await service.listPendingScenarios()).toHaveLength(0);
  });

  it('returns updates to draft for re-review', async () => {
    const zipBytes = await buildScenarioZip();
    const created = await service.uploadScenario(zipBytes, CREATOR);
    await service.approveScenario(created.id, 1, ADMIN);

    const updatedZip = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: 'Urban Night Raid Revised',
        description: 'Updated night operation.',
        author: 'Captain Vance',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'veteran',
        recommendedTonnage: 3600,
        maximumTonnage: 4800,
        estimatedPlayTimeMinutes: 55,
        tags: ['urban', 'night', 'revised'],
      },
    });

    const updated = await service.updateScenario(created.id, updatedZip, CREATOR);
    expect(updated.publicationStatus).toBe('draft');

    const list = await service.listScenarios({});
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe('Urban Night Raid');
    expect(await service.listPendingScenarios()).toHaveLength(1);
  });

  it('withdraws a pending update without replacing the last published metadata', async () => {
    const created = await service.uploadScenario(await buildScenarioZip(), CREATOR);
    await service.approveScenario(created.id, 1, ADMIN);
    await service.updateScenario(
      created.id,
      await buildScenarioZip({
        manifest: {
          schemaVersion: '1.0.0',
          title: 'Unapproved Replacement',
          description: 'This title must never replace revision one on withdrawal.',
          author: 'Captain Vance',
          gameVersion: '1.0.0',
          scenarioFormatVersion: '1.0.0',
          difficulty: 'veteran',
          recommendedTonnage: 3600,
          maximumTonnage: 4800,
          estimatedPlayTimeMinutes: 55,
          tags: ['withdrawal'],
        },
      }),
      CREATOR,
    );

    const archived = await service.withdrawScenario(created.id, CREATOR);

    expect(archived.title).toBe('Unapproved Replacement');
    expect(archived.publicationStatus).toBe('archived');
    expect((await store.getMetadata(created.id))?.title).toBe('Urban Night Raid');
    expect((await store.getMetadata(created.id))?.publicationStatus).toBe('archived');
    expect(await service.getScenario(created.id)).toBeNull();
    expect(await service.downloadScenario(created.id, 1)).not.toBeNull();
  });

  it('tombstones a scenario while retaining immutable release blobs', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes, CREATOR);
    await service.approveScenario(metadata.id, 1, ADMIN);
    await service.deleteScenario(metadata.id, ADMIN);

    expect(await service.getScenarioAdmin(metadata.id)).toBeNull();
    const list = await service.listScenarios({});
    expect(list.total).toBe(0);
    expect(await store.getRelease(metadata.id, 1)).not.toBeNull();
    expect(await store.getRevisionPackage(metadata.id, 1)).not.toBeNull();
  });

  it('allows only the verified owner to submit revisions', async () => {
    const created = await service.uploadScenario(await buildScenarioZip(), CREATOR);
    await expect(
      service.updateScenario(created.id, await buildScenarioZip(), {
        sub: 'different-google-sub',
        email: 'other@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('retains ownership when the verified Google subject keeps a changed email', async () => {
    const created = await service.uploadScenario(await buildScenarioZip(), CREATOR);
    await service.approveScenario(created.id, 1, ADMIN);
    await expect(
      service.updateScenario(created.id, await buildScenarioZip(), {
        sub: CREATOR.sub,
        email: 'creator-renamed@example.com',
      }),
    ).resolves.toMatchObject({ revision: 2, publicationStatus: 'draft' });
  });

  it('serializes concurrent updates across independent service instances', async () => {
    const shared = new InMemoryBlobStore();
    const first = new ScenarioService(shared);
    const second = new ScenarioService(shared);
    const created = await first.uploadScenario(await buildScenarioZip(), CREATOR);
    await first.approveScenario(created.id, 1, ADMIN);
    const revised = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: 'Concurrent Revision',
        description: 'Two writers race for revision two.',
        author: 'Captain Vance',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'veteran',
        recommendedTonnage: 3600,
        maximumTonnage: 4800,
        estimatedPlayTimeMinutes: 55,
        tags: ['concurrency'],
      },
    });
    const results = await Promise.allSettled([
      first.updateScenario(created.id, revised, CREATOR),
      second.updateScenario(created.id, revised, CREATOR),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await first.listPendingScenarios())[0]?.revision).toBe(2);
  });

  it('serializes concurrent approve, reject, and withdraw commands for one revision', async () => {
    const shared = new InMemoryBlobStore();
    const draft = await new ScenarioService(shared).uploadScenario(
      await buildScenarioZip(),
      CREATOR,
    );
    const results = await Promise.allSettled([
      new ScenarioService(shared).approveScenario(draft.id, 1, ADMIN),
      new ScenarioService(shared).rejectScenario(draft.id, 1, 'Concurrent rejection.', ADMIN),
      new ScenarioService(shared).withdrawScenario(draft.id, CREATOR),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expect(fulfilled).toBeLessThanOrEqual(2);
    expect(results.filter((result) => result.status === 'rejected').length).toBeGreaterThanOrEqual(
      1,
    );
    const submission = await shared.getSubmission(draft.id);
    expect(['published', 'archived']).toContain(submission?.metadata.publicationStatus);
    expect(
      (await new ScenarioService(shared).getScenario(draft.id))?.publicationStatus ?? 'archived',
    ).toBe(submission?.metadata.publicationStatus);
  });

  it('blocks withdrawal while an approved pointer is between activation and publication', async () => {
    const shared = new InMemoryBlobStore();
    const base = new ScenarioService(shared);
    const draft = await base.uploadScenario(await buildScenarioZip(), CREATOR);
    let releasePointer!: () => void;
    const pointerGate = new Promise<void>((resolve) => {
      releasePointer = resolve;
    });
    const paused = new Proxy(shared, {
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
    }) as ScenarioBlobStore;
    const approving = new ScenarioService(paused).approveScenario(draft.id, 1, ADMIN);
    await vi.waitFor(async () => {
      expect((await shared.getSubmission(draft.id))?.activation?.revision).toBe(1);
    });
    await expect(base.withdrawScenario(draft.id, CREATOR)).rejects.toMatchObject({
      statusCode: 409,
    });
    releasePointer();
    await expect(approving).resolves.toMatchObject({ publicationStatus: 'published' });
  });

  it('keeps publication unavailable after every injected approval failure and supports retry', async () => {
    const methods: (keyof ScenarioBlobStore)[] = [
      'setRelease',
      'setPackage',
      'setThumbnail',
      'setSubmission',
      'setMetadata',
    ];
    for (const method of methods) {
      const shared = new InMemoryBlobStore();
      const base = new ScenarioService(shared);
      const draft = await base.uploadScenario(await buildScenarioZip(), CREATOR);
      await expect(
        new ScenarioService(failOnce(shared, method)).approveScenario(draft.id, 1, ADMIN),
      ).rejects.toThrow(/injected/);
      expect(await base.getScenario(draft.id)).toBeNull();
      await expect(base.approveScenario(draft.id, 1, ADMIN)).resolves.toMatchObject({
        publicationStatus: 'published',
        publishedRevision: 1,
      });
    }
  });

  it('supports revision rollback while keeping newer revisions downloadable', async () => {
    const revisionOne = await buildScenarioZip();
    const created = await service.uploadScenario(revisionOne, CREATOR);
    await service.approveScenario(created.id, 1, ADMIN);
    const revisionTwo = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: 'Revision Two',
        description: 'Second immutable scenario revision.',
        author: 'Captain Vance',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'veteran',
        recommendedTonnage: 3600,
        maximumTonnage: 4800,
        estimatedPlayTimeMinutes: 55,
        tags: ['rollback'],
      },
    });
    await service.updateScenario(created.id, revisionTwo, CREATOR);
    await service.approveScenario(created.id, 2, ADMIN);

    const rolledBack = await service.rollbackScenario(created.id, 1, ADMIN);
    expect(rolledBack.title).toBe('Urban Night Raid');
    expect(rolledBack.publishedRevision).toBe(1);
    expect(rolledBack.availableRevisions).toEqual([1, 2]);
    expect(await service.downloadScenario(created.id, 2)).not.toBeNull();
  });
});
