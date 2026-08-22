import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBlobStore } from '../netlify/functions/lib/campaign-blob-store.ts';
import type { ScenarioBlobStore } from '../netlify/functions/lib/blob-store.ts';
import type { SupportBlobStore } from '../netlify/functions/lib/support-blob-store.ts';

const stores = vi.hoisted(() => ({
  scenario: undefined as unknown as ScenarioBlobStore,
  campaign: undefined as unknown as CampaignBlobStore,
  support: undefined as unknown as SupportBlobStore,
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

vi.mock('../netlify/functions/lib/netlify-support-blob-store.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../netlify/functions/lib/netlify-support-blob-store.ts')>();
  return { ...actual, createNetlifySupportBlobStore: () => stores.support };
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
import { InMemorySupportBlobStore } from '../netlify/functions/lib/netlify-support-blob-store.ts';

const savedEnvironment = { ...process.env };

const payload = {
  type: 'request',
  severity: 'medium',
  title: 'Add a pause confirmation dialog',
  description: 'It is too easy to abandon a mission with one misclick.',
  repro: 'Open a mission, press the pause key twice by accident.',
};

function request(path: string, init: RequestInit = {}, token?: 'creator' | 'other' | 'admin') {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return handler(new Request(`http://localhost${path}`, { ...init, headers }));
}

beforeEach(() => {
  stores.scenario = new InMemoryBlobStore();
  stores.campaign = new InMemoryCampaignBlobStore();
  stores.support = new InMemorySupportBlobStore();
  process.env.NODE_ENV = 'test';
  process.env.COMMUNITY_ENVIRONMENT = 'development';
  process.env.COMMUNITY_MUTATION_MODE = 'authenticated';
  process.env.ADMIN_GOOGLE_SUBS = 'admin-sub';
});

afterEach(() => {
  process.env = { ...savedEnvironment };
});

describe('support ticket API', () => {
  it('keeps the list anonymous, requires Google session writes, and strips reporter email', async () => {
    expect((await request('/api/v1/support')).status).toBe(200);
    expect(
      (
        await request('/api/v1/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ).status,
    ).toBe(401);

    const createdResponse = await request(
      '/api/v1/support',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'creator',
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { id: string; reporterEmail?: string };
    expect(created.reporterEmail).toBe('creator@example.com');

    const anonymous = await request('/api/v1/support');
    const listed = (await anonymous.json()) as { items: Array<Record<string, unknown>> };
    expect(listed.items[0]).toMatchObject({ id: created.id, status: 'open', voteCount: 0 });
    expect(listed.items[0]).not.toHaveProperty('reporterSub');
    expect(listed.items[0]?.reporterEmail).toBeUndefined();

    expect(
      (
        await request(
          `/api/v1/support/${created.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, title: 'Please add a pause confirmation dialog' }),
          },
          'other',
        )
      ).status,
    ).toBe(403);
  });

  it('toggles votes, forbids player status changes, and hides tickets after admin hide', async () => {
    const createdResponse = await request(
      '/api/v1/support',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'creator',
    );
    const created = (await createdResponse.json()) as { id: string };

    const voted = await request(`/api/v1/support/${created.id}/votes`, { method: 'POST' }, 'other');
    expect(voted.status).toBe(200);
    expect(await voted.json()).toMatchObject({ voteCount: 1, hasVoted: true });

    expect(
      (
        await request(
          `/api/v1/support/${created.id}/status`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'closed' }),
          },
          'creator',
        )
      ).status,
    ).toBe(403);

    const hidden = await request(
      `/api/v1/support/${created.id}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'hidden' }),
      },
      'admin',
    );
    expect(hidden.status).toBe(200);
    expect((await request(`/api/v1/support/${created.id}`)).status).toBe(404);
    expect((await request(`/api/v1/support/${created.id}`, {}, 'admin')).status).toBe(200);

    const me = await request('/api/v1/auth/me', {}, 'admin');
    expect(await me.json()).toMatchObject({ email: 'admin@example.com', isAdmin: true });
  });

  it('returns JSON 503 for writes when community mutations are disabled', async () => {
    process.env.COMMUNITY_MUTATION_MODE = 'disabled';
    const listed = await request('/api/v1/support');
    expect(listed.status).toBe(200);

    const created = await request(
      '/api/v1/support',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'creator',
    );
    expect(created.status).toBe(503);
    expect(created.headers.get('Content-Type')).toMatch(/^application\/json/);
  });
});
