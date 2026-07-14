import { beforeEach, describe, expect, it } from 'vitest';
import { buildScenarioZip } from '../fixtures/build-fixtures.ts';
import { InMemoryBlobStore } from '../netlify/functions/lib/netlify-blob-store.ts';
import { ScenarioService, ServiceError } from '../netlify/functions/lib/scenario-service.ts';

describe('scenario service', () => {
  let store: InMemoryBlobStore;
  let service: ScenarioService;

  beforeEach(() => {
    store = new InMemoryBlobStore();
    service = new ScenarioService(store);
  });

  it('uploads a valid package and lists it', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes);
    expect(metadata.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(metadata.checksumSha256).toHaveLength(64);

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

    await service.uploadScenario(veteran);
    await service.uploadScenario(recruit);

    const filtered = await service.listScenarios({
      difficulty: 'recruit',
      maxTonnage: '2000',
    });

    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.difficulty).toBe('recruit');
  });

  it('replaces ratings from the same client ID', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes);
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

  it('rejects invalid upload packages', async () => {
    const zipBytes = await buildScenarioZip({ omit: ['map.json'] });
    await expect(service.uploadScenario(zipBytes)).rejects.toBeInstanceOf(ServiceError);
  });

  it('updates an existing scenario package in place', async () => {
    const zipBytes = await buildScenarioZip();
    const created = await service.uploadScenario(zipBytes);
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

    const updated = await service.updateScenario(created.id, updatedZip);
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('Urban Night Raid Revised');
    expect(updated.ratingCount).toBe(1);
    expect(updated.averageRating).toBe(4);
    expect(updated.downloadCount).toBe(created.downloadCount);

    const list = await service.listScenarios({});
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe('Urban Night Raid Revised');
  });

  it('deletes a scenario and its blobs', async () => {
    const zipBytes = await buildScenarioZip();
    const metadata = await service.uploadScenario(zipBytes);
    await service.deleteScenario(metadata.id);

    expect(await service.getScenario(metadata.id)).toBeNull();
    const list = await service.listScenarios({});
    expect(list.total).toBe(0);
  });
});
