import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const store = {
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    set: vi.fn(async () => ({ modified: true, etag: 'etag-next' })),
    delete: vi.fn(),
    list: vi.fn(async () => ({ blobs: [] })),
  };
  return { store, getStore: vi.fn(() => store) };
});

vi.mock('@netlify/blobs', () => ({ getStore: mock.getStore }));

import { createNetlifyBlobStore } from '../netlify/functions/lib/netlify-blob-store.ts';
import { createNetlifyCampaignBlobStore } from '../netlify/functions/lib/netlify-campaign-blob-store.ts';
import { createNetlifySupportBlobStore } from '../netlify/functions/lib/netlify-support-blob-store.ts';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  process.env.COMMUNITY_ENVIRONMENT = 'development';
  delete process.env.COMMUNITY_API_ORIGIN;
  delete process.env.SCENARIO_BLOB_STORE;
  delete process.env.SESSION_SIGNING_SECRET_ID;
});

describe('Netlify Blob production adapter contract', () => {
  it('opens a strong-consistency store and forwards CAS metadata writes', async () => {
    const store = createNetlifyBlobStore();
    expect(mock.getStore).toHaveBeenCalledWith({
      name: 'mech-scenarios-development-v1',
      consistency: 'strong',
    });
    await store.setMetadata({ id: '11111111-1111-4111-8111-111111111111' } as never, {
      onlyIfMatch: 'etag-current',
    });
    expect(mock.store.set).toHaveBeenCalledWith(
      'meta/11111111-1111-4111-8111-111111111111.json',
      expect.any(String),
      expect.objectContaining({ onlyIfMatch: 'etag-current' }),
    );
  });

  it('uses create-only writes for immutable scenario releases', async () => {
    const store = createNetlifyBlobStore();
    await store.setRevisionPackage('11111111-1111-4111-8111-111111111111', 2, new Uint8Array([1]));
    expect(mock.store.set).toHaveBeenCalledWith(
      'revisions/scenarios/11111111-1111-4111-8111-111111111111/2/package.zip',
      expect.any(Uint8Array),
      expect.objectContaining({ onlyIfNew: true }),
    );
  });

  it('uses create-only stable campaign claims and immutable campaign releases', async () => {
    const store = createNetlifyCampaignBlobStore();
    await store.setStableIdClaim(
      {
        schemaVersion: 1,
        stableCampaignId: 'custom-safe-id',
        repositoryId: '22222222-2222-4222-8222-222222222222',
        ownerSub: 'owner-sub',
        initialChecksumSha256: 'a'.repeat(64),
        state: 'active',
        createdAt: '2026-08-22T00:00:00.000Z',
        updatedAt: '2026-08-22T00:00:00.000Z',
      },
      { onlyIfNew: true },
    );
    expect(mock.store.set).toHaveBeenCalledWith(
      'claims/campaign-ids/custom-safe-id.json',
      expect.any(String),
      expect.objectContaining({ onlyIfNew: true }),
    );
    await store.setRevisionPackage('22222222-2222-4222-8222-222222222222', 1, new Uint8Array([2]));
    expect(mock.store.set).toHaveBeenLastCalledWith(
      'revisions/campaigns/22222222-2222-4222-8222-222222222222/1/package.zip',
      expect.any(Uint8Array),
      expect.objectContaining({ onlyIfNew: true }),
    );
  });

  it('lists support tickets when the local Blob sandbox omits ETags', async () => {
    const ticket = {
      schemaVersion: 1,
      id: '97bccb41-9843-456d-a2e9-792cee18fc8b',
      type: 'bug',
      severity: 'medium',
      status: 'open',
      title: 'Mechs fall through the map after deploy',
      description: 'A lance falls through the terrain after the second turn.',
      repro: 'Start a mission, move two hexes, wait until turn 2.',
      reporterSub: 'google-sub',
      reporterEmail: 'player@example.com',
      voteCount: 0,
      createdAt: '2026-08-22T12:00:00.000Z',
      updatedAt: '2026-08-22T12:00:00.000Z',
    };
    mock.store.list.mockResolvedValue({
      blobs: [{ key: `support/tickets/${ticket.id}.json` }],
    });
    mock.store.getWithMetadata.mockResolvedValue({
      data: JSON.stringify(ticket),
      metadata: { contentType: 'application/json' },
    });
    const store = createNetlifySupportBlobStore();
    await expect(store.getTicket(ticket.id)).resolves.toMatchObject({ id: ticket.id });
    await store.setTicket(ticket, { onlyIfMatch: `sandbox:support/tickets/${ticket.id}.json` });
    expect(mock.store.set).toHaveBeenCalledWith(
      `support/tickets/${ticket.id}.json`,
      expect.any(String),
      expect.not.objectContaining({ onlyIfMatch: expect.anything() }),
    );
  });
});
