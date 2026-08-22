import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScenarioZip } from '../fixtures/build-fixtures.ts';
import type { CampaignBlobStore } from '../netlify/functions/lib/campaign-blob-store.ts';
import type { ScenarioBlobStore } from '../netlify/functions/lib/blob-store.ts';

const stores = vi.hoisted(() => ({
  scenario: undefined as unknown as ScenarioBlobStore,
  campaign: undefined as unknown as CampaignBlobStore,
}));

vi.mock('../netlify/functions/lib/netlify-blob-store.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../netlify/functions/lib/netlify-blob-store.ts')>();
  return { ...actual, createNetlifyBlobStore: () => stores.scenario };
});

vi.mock('../netlify/functions/lib/netlify-campaign-blob-store.ts', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../netlify/functions/lib/netlify-campaign-blob-store.ts')
    >();
  return { ...actual, createNetlifyCampaignBlobStore: () => stores.campaign };
});

vi.mock('../netlify/functions/lib/auth.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../netlify/functions/lib/auth.ts')>();
  function creator(request: Request) {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (token === 'creator') return { sub: 'creator-sub', email: 'creator@example.com' };
    if (token === 'other') return { sub: 'other-sub', email: 'other@example.com' };
    if (token === 'admin') return { sub: 'admin-sub', email: 'admin@example.com' };
    throw new actual.AuthError(401, 'Authentication is required.');
  }
  return {
    ...actual,
    requireCreator: vi.fn(async (request: Request) => creator(request)),
    requireAdmin: vi.fn(async (request: Request) => {
      const identity = creator(request);
      if (identity.sub !== 'admin-sub') throw new actual.AuthError(403, 'Admin access required.');
      return identity;
    }),
  };
});

import handler from '../netlify/functions/api-v1.ts';
import { InMemoryCampaignBlobStore } from '../netlify/functions/lib/netlify-campaign-blob-store.ts';
import { InMemoryBlobStore } from '../netlify/functions/lib/netlify-blob-store.ts';

const savedEnvironment = { ...process.env };

function request(path: string, init: RequestInit = {}, token?: 'creator' | 'other' | 'admin') {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return handler(new Request(`http://localhost${path}`, { ...init, headers }));
}

beforeEach(() => {
  stores.scenario = new InMemoryBlobStore();
  stores.campaign = new InMemoryCampaignBlobStore();
  process.env.NODE_ENV = 'test';
  process.env.COMMUNITY_ENVIRONMENT = 'development';
  process.env.COMMUNITY_MUTATION_MODE = 'authenticated';
});

afterEach(() => {
  process.env = { ...savedEnvironment };
});

describe('community scenario API lifecycle', () => {
  it('keeps reads anonymous while enforcing owner and revision-specific moderation', async () => {
    expect(await (await request('/api/v1/scenarios')).json()).toMatchObject({ total: 0 });

    const firstPackage = await buildScenarioZip();
    expect(
      (
        await request('/api/v1/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: firstPackage,
        })
      ).status,
    ).toBe(401);

    const createdResponse = await request(
      '/api/v1/scenarios',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: firstPackage,
      },
      'creator',
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      metadata: { revision: number };
    };
    expect(created.metadata.revision).toBe(1);
    expect(await (await request('/api/v1/scenarios')).json()).toMatchObject({ total: 0 });
    expect((await request(`/api/v1/scenarios/${created.id}`)).status).toBe(404);
    expect((await request(`/api/v1/scenarios/${created.id}/download`)).status).toBe(404);
    expect((await request(`/api/v1/scenarios/${created.id}/releases/1/download`)).status).toBe(
      404,
    );
    expect((await request(`/api/v1/scenarios/${created.id}/status`, {}, 'other')).status).toBe(403);

    const rejected = await request(
      `/api/v1/admin/scenarios/${created.id}/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, reason: 'Clarify the extraction objective.' }),
      },
      'admin',
    );
    expect(rejected.status).toBe(200);
    expect(
      await (await request(`/api/v1/scenarios/${created.id}/status`, {}, 'creator')).json(),
    ).toMatchObject({
      publicationStatus: 'archived',
      rejection: { reason: 'Clarify the extraction objective.', moderatorSub: 'admin-sub' },
    });

    const secondPackage = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: 'Urban Night Raid Revised',
        description: 'A revised scenario with a clarified extraction objective.',
        author: 'Commander Test',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'regular',
        recommendedTonnage: 2400,
        maximumTonnage: 3200,
        estimatedPlayTimeMinutes: 45,
        tags: ['urban', 'night'],
      },
    });
    expect(
      (
        await request(
          `/api/v1/scenarios/${created.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/zip' },
            body: secondPackage,
          },
          'other',
        )
      ).status,
    ).toBe(403);
    const revisionResponse = await request(
      `/api/v1/scenarios/${created.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: secondPackage,
      },
      'creator',
    );
    expect(revisionResponse.status).toBe(200);
    expect(await revisionResponse.json()).toMatchObject({ metadata: { revision: 2 } });

    const approval = await request(
      `/api/v1/admin/scenarios/${created.id}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 2 }),
      },
      'admin',
    );
    expect(approval.status).toBe(200);
    expect(await (await request('/api/v1/scenarios')).json()).toMatchObject({
      total: 1,
      items: [{ id: created.id, publishedRevision: 2 }],
    });

    const download = await request(`/api/v1/scenarios/${created.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get('Content-Type')).toBe('application/zip');
    expect(download.headers.get('X-Checksum-Sha256')).toMatch(/^[a-f0-9]{64}$/);
    expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const rating = await request(`/api/v1/scenarios/${created.id}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: '550e8400-e29b-41d4-a716-446655440000',
        rating: 5,
      }),
    });
    expect(rating.status).toBe(200);
    expect(await rating.json()).toMatchObject({ averageRating: 5, ratingCount: 1 });

    const withdrawn = await request(
      `/api/v1/scenarios/${created.id}`,
      { method: 'DELETE' },
      'creator',
    );
    expect(withdrawn.status).toBe(200);
    expect((await request(`/api/v1/scenarios/${created.id}`)).status).toBe(404);
    expect((await request(`/api/v1/scenarios/${created.id}/releases/2/download`)).status).toBe(200);
  });
});
