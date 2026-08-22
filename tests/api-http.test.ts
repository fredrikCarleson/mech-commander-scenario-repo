import { afterEach, describe, expect, it } from 'vitest';
import handler from '../netlify/functions/api-v1.ts';
import {
  corsPreflightResponse,
  parseApiPath,
  readBoundedBody,
} from '../netlify/functions/lib/http.ts';

const savedEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnvironment };
});

describe('API HTTP boundary', () => {
  it('parses immutable revision and moderation rollback routes', () => {
    expect(
      parseApiPath('/api/v1/campaigns/11111111-1111-4111-8111-111111111111/releases/2/download'),
    ).toEqual({
      resource: 'campaigns',
      id: '11111111-1111-4111-8111-111111111111',
      action: 'download',
      revision: 2,
    });
    expect(parseApiPath('/api/v1/support/11111111-1111-4111-8111-111111111111/votes')).toEqual({
      resource: 'support',
      id: '11111111-1111-4111-8111-111111111111',
      action: 'votes',
      revision: null,
    });
  });

  it('returns explicit allowlisted CORS and JSON for rejected preflights', async () => {
    process.env.NODE_ENV = 'test';
    process.env.COMMUNITY_ENVIRONMENT = 'development';
    const allowed = corsPreflightResponse(
      new Request('http://localhost/api/v1/scenarios', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      }),
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

    const denied = corsPreflightResponse(
      new Request('http://localhost/api/v1/scenarios', {
        method: 'OPTIONS',
        headers: { Origin: 'https://attacker.example' },
      }),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
    await expect(denied.json()).resolves.toEqual({ error: 'Origin is not allowed.' });
  });

  it('rejects oversized bodies before parsing them', async () => {
    const request = new Request('http://localhost/api/v1/scenarios', {
      method: 'POST',
      headers: { 'Content-Length': '101' },
      body: new Uint8Array([1]),
    });
    await expect(readBoundedBody(request, 100)).rejects.toMatchObject({ statusCode: 413 });
  });

  it('turns environment/configuration failures into JSON instead of SPA HTML', async () => {
    process.env.COMMUNITY_ENVIRONMENT = 'ambiguous';
    const response = await handler(new Request('https://example.test/api/v1/not-a-route'));
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error.' });
  });
});
