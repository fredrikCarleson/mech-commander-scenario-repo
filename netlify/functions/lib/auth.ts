import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export class AuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string): boolean {
  const admins = adminEmails();
  if (admins.size === 0) {
    return false;
  }
  return admins.has(email.trim().toLowerCase());
}

export async function requireAdmin(request: Request): Promise<{ email: string }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(401, 'Admin authentication required.');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new AuthError(401, 'Admin authentication required.');
  }

  const apiKey = process.env.ADMIN_API_KEY?.trim();
  if (apiKey && token === apiKey) {
    const fallbackEmail = [...adminEmails()][0];
    if (!fallbackEmail) {
      throw new AuthError(503, 'Admin access is not configured.');
    }
    return { email: fallbackEmail };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new AuthError(503, 'Google sign-in is not configured.');
  }

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    });

    if (payload.email_verified !== true) {
      throw new AuthError(403, 'Google account email is not verified.');
    }

    const email = String(payload.email ?? '').trim();
    if (!email || !isAdminEmail(email)) {
      throw new AuthError(403, 'You are not authorized to perform this action.');
    }

    return { email };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(401, 'Invalid or expired sign-in token.');
  }
}
