import { generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  issueCreatorSession,
  requireAdmin,
  requireCreator,
  verifyGoogleIdentityTokenWithKey,
} from '../netlify/functions/lib/auth.ts';
import {
  COMMUNITY_ENVIRONMENT_MATRIX,
  resolveCommunityEnvironment,
} from '../netlify/functions/lib/community-environment.ts';
import { config as authRateLimit } from '../netlify/functions/auth-session-rate-limited.ts';
import { config as writeRateLimit } from '../netlify/functions/community-write-rate-limited.ts';
import rateLimitResponse from '../netlify/functions/rate-limit-response.ts';

const savedEnvironment = { ...process.env };

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...savedEnvironment };
  vi.restoreAllMocks();
});

function configured(name: 'staging' | 'production'): NodeJS.ProcessEnv {
  const expected = COMMUNITY_ENVIRONMENT_MATRIX[name];
  return {
    COMMUNITY_ENVIRONMENT: name,
    COMMUNITY_API_ORIGIN: expected.apiOrigin,
    SCENARIO_BLOB_STORE: expected.blobStore,
    SESSION_SIGNING_SECRET_ID: expected.sessionSecretId,
    COMMUNITY_MUTATION_MODE: 'authenticated',
    COMMUNITY_CORS_ORIGINS: 'https://trusted.example',
  };
}

describe('environment isolation and rollback configuration', () => {
  it('proves candidate and production namespaces and secret identities differ', () => {
    const staging = resolveCommunityEnvironment(configured('staging'));
    const production = resolveCommunityEnvironment(configured('production'));
    expect(staging.blobStore).not.toBe(production.blobStore);
    expect(staging.sessionSecretId).not.toBe(production.sessionSecretId);
    expect(staging.apiOrigin).not.toBe(production.apiOrigin);
    expect(staging.blobConsistency).toBe('strong');
    expect(production.blobConsistency).toBe('strong');
  });

  it('fails candidate builds closed on missing or production storage identity', () => {
    const missing = configured('staging');
    delete missing.SCENARIO_BLOB_STORE;
    expect(() => resolveCommunityEnvironment(missing)).toThrow(/Blob store/i);

    const crossed = configured('staging');
    crossed.SCENARIO_BLOB_STORE = COMMUNITY_ENVIRONMENT_MATRIX.production.blobStore;
    expect(() => resolveCommunityEnvironment(crossed)).toThrow(/Blob store|production/i);
  });

  it('accepts the explicit disabled mutation mode for the safe rollback artifact', () => {
    const environment = configured('production');
    environment.COMMUNITY_MUTATION_MODE = 'disabled';
    expect(resolveCommunityEnvironment(environment).mutationMode).toBe('disabled');
  });
});

describe('authentication boundaries', () => {
  it('requires a matching nonce and verified email on Google identity tokens', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({
      email: 'Creator@Example.com',
      email_verified: true,
      nonce: 'expected-nonce',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience('desktop-client.apps.googleusercontent.com')
      .setSubject('immutable-google-sub')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(
      verifyGoogleIdentityTokenWithKey(
        token,
        publicKey,
        ['web-client.apps.googleusercontent.com', 'desktop-client.apps.googleusercontent.com'],
        'expected-nonce',
      ),
    ).resolves.toEqual({ sub: 'immutable-google-sub', email: 'creator@example.com' });
    await expect(
      verifyGoogleIdentityTokenWithKey(
        token,
        publicKey,
        ['desktop-client.apps.googleusercontent.com'],
        'wrong-nonce',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });

    await expect(
      verifyGoogleIdentityTokenWithKey(
        token,
        publicKey,
        ['different-client.apps.googleusercontent.com'],
        'expected-nonce',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });

    const unverified = await new SignJWT({
      email: 'creator@example.com',
      email_verified: false,
      nonce: 'expected-nonce',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience('desktop-client.apps.googleusercontent.com')
      .setSubject('immutable-google-sub')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(
      verifyGoogleIdentityTokenWithKey(
        unverified,
        publicKey,
        ['desktop-client.apps.googleusercontent.com'],
        'expected-nonce',
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    const expired = await new SignJWT({
      email: 'creator@example.com',
      email_verified: true,
      nonce: 'expected-nonce',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience('desktop-client.apps.googleusercontent.com')
      .setSubject('immutable-google-sub')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    await expect(
      verifyGoogleIdentityTokenWithKey(
        expired,
        publicKey,
        ['desktop-client.apps.googleusercontent.com'],
        'expected-nonce',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('binds creator sessions to the environment and secret identity', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      COMMUNITY_ENVIRONMENT: 'development',
      SESSION_SIGNING_SECRET: 'test-secret-that-is-longer-than-thirty-two-bytes',
    };
    const session = await issueCreatorSession({ sub: 'creator-sub', email: 'creator@example.com' });
    const request = new Request('http://localhost/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    await expect(requireCreator(request)).resolves.toEqual({
      sub: 'creator-sub',
      email: 'creator@example.com',
    });

    process.env = {
      ...process.env,
      ...configured('staging'),
      SESSION_SIGNING_SECRET: 'test-secret-that-is-longer-than-thirty-two-bytes',
    };
    await expect(requireCreator(request)).rejects.toBeInstanceOf(AuthError);
  });

  it('expires creator sessions and authorizes administrators by immutable subject only', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      COMMUNITY_ENVIRONMENT: 'development',
      SESSION_SIGNING_SECRET: 'test-secret-that-is-longer-than-thirty-two-bytes',
      ADMIN_GOOGLE_SUBS: 'admin-sub',
    };
    const adminSession = await issueCreatorSession({
      sub: 'admin-sub',
      email: 'admin@example.com',
    });
    const creatorSession = await issueCreatorSession({
      sub: 'creator-sub',
      email: 'admin@example.com',
    });
    const request = (token: string) =>
      new Request('http://localhost/api/v1/admin/scenarios', {
        headers: { Authorization: `Bearer ${token}` },
      });

    await expect(requireAdmin(request(adminSession.token))).resolves.toMatchObject({
      sub: 'admin-sub',
    });
    await expect(requireAdmin(request(creatorSession.token))).rejects.toMatchObject({
      statusCode: 403,
    });

    vi.setSystemTime(new Date('2026-08-22T14:00:01.000Z'));
    await expect(requireCreator(request(adminSession.token))).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('production-wide rate-limit declarations', () => {
  it('uses exactly the session and community-write rules with trusted aggregation', () => {
    expect(authRateLimit.rateLimit).toMatchObject({
      action: 'rewrite',
      windowLimit: 10,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    });
    expect(writeRateLimit.rateLimit).toMatchObject({
      action: 'rewrite',
      windowLimit: 20,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    });
    expect(writeRateLimit.method).toEqual(['POST', 'PUT']);
    expect(writeRateLimit.path).toEqual(
      expect.arrayContaining([
        '/api/v1/scenarios',
        '/api/v1/scenarios/:id',
        '/api/v1/scenarios/:id/ratings',
        '/api/v1/campaigns',
        '/api/v1/campaigns/:id',
        '/api/v1/campaigns/:id/ratings',
      ]),
    );
  });

  it('returns a bounded JSON 429 response from the platform rewrite target', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      COMMUNITY_ENVIRONMENT: 'development',
    };
    const response = await rateLimitResponse(
      new Request('http://localhost/api/v1/rate-limited', {
        headers: { Origin: 'http://localhost:5173' },
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    await expect(response.json()).resolves.toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });
});
