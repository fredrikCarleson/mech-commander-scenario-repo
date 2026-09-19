import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { resolveCommunityEnvironment } from './community-environment.ts';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const SESSION_ISSUER = 'meridian-strike-community-repository';
const SESSION_AUDIENCE = 'meridian-strike-community-author';
const SESSION_TTL_SECONDS = 60 * 60;

export interface AuthenticatedCreator {
  sub: string;
  email: string;
}

export class AuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function configuredValues(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function googleClientIds(): string[] {
  const environment = resolveCommunityEnvironment();
  const web = configuredValues('GOOGLE_WEB_CLIENT_IDS');
  const desktop = configuredValues('GOOGLE_DESKTOP_CLIENT_IDS');
  if (environment.name !== 'development' && (web.length === 0 || desktop.length === 0)) {
    throw new AuthError(503, 'Both Google Web and Desktop OAuth audiences must be configured.');
  }
  return [
    ...new Set([
      ...web,
      ...desktop,
      ...configuredValues('GOOGLE_CLIENT_IDS'),
      ...(environment.name === 'development' && process.env.GOOGLE_CLIENT_ID?.trim()
        ? [process.env.GOOGLE_CLIENT_ID.trim()]
        : []),
    ]),
  ];
}

function bearerToken(request: Request): string {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(401, 'Authentication required.');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) throw new AuthError(401, 'Authentication required.');
  return token;
}

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AuthError(503, 'Community author sessions are not configured.');
  }
  return new TextEncoder().encode(secret);
}

function sessionClaims() {
  const environment = resolveCommunityEnvironment();
  return {
    issuer: `${SESSION_ISSUER}:${environment.name}:${environment.sessionSecretId}`,
    audience: `${SESSION_AUDIENCE}:${environment.name}`,
  };
}

type JwtVerificationKey = Parameters<typeof jwtVerify>[1];

export async function verifyGoogleIdentityTokenWithKey(
  token: string,
  key: JwtVerificationKey,
  audiences: string[],
  expectedNonce?: string,
): Promise<AuthenticatedCreator> {
  if (audiences.length === 0) {
    throw new AuthError(503, 'Google sign-in is not configured.');
  }
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: GOOGLE_ISSUERS,
      audience: audiences,
    });
    if (payload.email_verified !== true) {
      throw new AuthError(403, 'Google account email is not verified.');
    }
    const sub = String(payload.sub ?? '').trim();
    const email = String(payload.email ?? '')
      .trim()
      .toLowerCase();
    if (!sub || !email) throw new AuthError(403, 'Google identity is incomplete.');
    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new AuthError(401, 'Google sign-in nonce validation failed.');
    }
    return { sub, email };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, 'Invalid or expired Google sign-in token.');
  }
}

export async function verifyGoogleIdentityToken(
  token: string,
  expectedNonce?: string,
): Promise<AuthenticatedCreator> {
  return verifyGoogleIdentityTokenWithKey(token, GOOGLE_JWKS, googleClientIds(), expectedNonce);
}

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const AUTH_CODE_MAX_LENGTH = 2048;

export interface DesktopGoogleAuthorization {
  authorizationCode: string;
  redirectUri: string;
  codeVerifier: string;
  nonce: string;
  clientId?: string;
}

function readNonce(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 256) {
    throw new AuthError(400, 'OAuth nonce is required.');
  }
  return value;
}

export function isLoopbackOAuthRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.pathname === '/oauth/callback' &&
      Number.isInteger(port) &&
      port >= 1 &&
      port <= 65535 &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

function desktopClientIds(): string[] {
  const ids = [...configuredValues('GOOGLE_DESKTOP_CLIENT_IDS')];
  if (ids.length > 0) return ids;
  const fallback = process.env.GOOGLE_CLIENT_ID?.trim();
  if (resolveCommunityEnvironment().name === 'development' && fallback) return [fallback];
  throw new AuthError(503, 'Desktop Google sign-in is not configured.');
}

function desktopClientSecret(): string {
  const secret = process.env.GOOGLE_DESKTOP_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new AuthError(503, 'Desktop Google sign-in is not configured.');
  }
  return secret;
}

export async function exchangeDesktopGoogleAuthorizationCode(
  input: DesktopGoogleAuthorization,
  deps: {
    fetchImpl?: typeof fetch;
    verifyIdentityToken?: (token: string, expectedNonce?: string) => Promise<AuthenticatedCreator>;
  } = {},
): Promise<AuthenticatedCreator> {
  if (!isLoopbackOAuthRedirect(input.redirectUri)) {
    throw new AuthError(400, 'Desktop sign-in redirect URI is invalid.');
  }
  if (!PKCE_VERIFIER.test(input.codeVerifier)) {
    throw new AuthError(400, 'Desktop sign-in code verifier is invalid.');
  }
  if (input.authorizationCode.length < 1 || input.authorizationCode.length > AUTH_CODE_MAX_LENGTH) {
    throw new AuthError(400, 'Desktop sign-in authorization code is invalid.');
  }
  const allowedDesktopIds = desktopClientIds();
  const clientId = input.clientId?.trim() || allowedDesktopIds[0];
  if (!clientId || !allowedDesktopIds.includes(clientId)) {
    throw new AuthError(401, 'Desktop Google client is not allowed.');
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code: input.authorizationCode,
      client_id: clientId,
      client_secret: desktopClientSecret(),
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    }),
  });
  const payload = (await response.json().catch(() => undefined)) as
    { id_token?: unknown; error?: unknown } | undefined;
  if (!response.ok || typeof payload?.id_token !== 'string') {
    const googleError =
      typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
    console.error('Google desktop token exchange failed', googleError);
    throw new AuthError(401, 'Google desktop sign-in exchange failed.');
  }
  const verifyIdentityToken = deps.verifyIdentityToken ?? verifyGoogleIdentityToken;
  return verifyIdentityToken(payload.id_token, input.nonce);
}

export async function authenticateGoogleCreator(body: unknown): Promise<AuthenticatedCreator> {
  if (!body || typeof body !== 'object') {
    throw new AuthError(400, 'Request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;
  const nonce = readNonce(record.nonce);
  const hasIdentity = typeof record.identityToken === 'string' && record.identityToken.length > 0;
  const hasDesktop =
    record.authorizationCode !== undefined ||
    record.redirectUri !== undefined ||
    record.codeVerifier !== undefined;
  if (hasIdentity && hasDesktop) {
    throw new AuthError(400, 'Use either a Google identity token or a desktop authorization code.');
  }
  if (hasDesktop) {
    if (
      typeof record.authorizationCode !== 'string' ||
      typeof record.redirectUri !== 'string' ||
      typeof record.codeVerifier !== 'string'
    ) {
      throw new AuthError(
        400,
        'Desktop sign-in requires authorizationCode, redirectUri, and codeVerifier.',
      );
    }
    return exchangeDesktopGoogleAuthorizationCode({
      authorizationCode: record.authorizationCode,
      redirectUri: record.redirectUri,
      codeVerifier: record.codeVerifier,
      nonce,
      clientId: typeof record.clientId === 'string' ? record.clientId : undefined,
    });
  }
  if (!hasIdentity) {
    throw new AuthError(400, 'Google identity token or desktop authorization code is required.');
  }
  return verifyGoogleIdentityToken(record.identityToken as string, nonce);
}

export async function issueCreatorSession(identity: AuthenticatedCreator): Promise<{
  token: string;
  expiresAt: number;
}> {
  const claims = sessionClaims();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await new SignJWT({ email: identity.email, role: 'creator' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.sub)
    .setIssuer(claims.issuer)
    .setAudience(claims.audience)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setJti(randomUUID())
    .sign(sessionSecret());
  return { token, expiresAt: expiresAt * 1000 };
}

async function readCreatorSession(token: string): Promise<AuthenticatedCreator> {
  try {
    const claims = sessionClaims();
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: claims.issuer,
      audience: claims.audience,
      algorithms: ['HS256'],
    });
    const sub = String(payload.sub ?? '').trim();
    const email = String(payload.email ?? '')
      .trim()
      .toLowerCase();
    if (!sub || !email || payload.role !== 'creator') {
      throw new AuthError(401, 'Invalid community author session.');
    }
    return { sub, email };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, 'Invalid or expired community author session.');
  }
}

export async function requireCreator(request: Request): Promise<AuthenticatedCreator> {
  return readCreatorSession(bearerToken(request));
}

export function isAdminSubject(sub: string): boolean {
  return configuredValues('ADMIN_GOOGLE_SUBS').has(sub);
}

export async function requireAdmin(request: Request): Promise<AuthenticatedCreator> {
  const token = bearerToken(request);
  let identity: AuthenticatedCreator;
  try {
    identity = await readCreatorSession(token);
  } catch {
    identity = await verifyGoogleIdentityToken(token);
  }
  if (!isAdminSubject(identity.sub)) {
    throw new AuthError(403, 'You are not authorized to perform this action.');
  }
  return identity;
}
