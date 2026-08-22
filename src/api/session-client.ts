const SESSION_TOKEN_KEY = 'scenario-repo-creator-session';

export interface CreatorSession {
  email: string;
  isAdmin: boolean;
}

export function getCreatorToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function setCreatorToken(token: string | null): void {
  if (!token) sessionStorage.removeItem(SESSION_TOKEN_KEY);
  else sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function createOAuthNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sessionHeaders(): HeadersInit {
  const token = getCreatorToken();
  if (!token) throw new Error('Sign-in required.');
  return { Authorization: `Bearer ${token}` };
}

async function handleJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) setCreatorToken(null);
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : response.statusText;
    throw new Error(message);
  }
  return data as T;
}

export async function createCreatorSession(
  identityToken: string,
  nonce: string,
): Promise<CreatorSession> {
  const response = await fetch('/api/v1/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken, nonce }),
  });
  const session = await handleJson<{ token: string; email: string }>(response);
  setCreatorToken(session.token);
  return fetchCreatorSession();
}

export async function fetchCreatorSession(): Promise<CreatorSession> {
  const response = await fetch('/api/v1/auth/me', { headers: sessionHeaders() });
  const data = await handleJson<{ email: string; isAdmin?: boolean }>(response);
  return { email: data.email, isAdmin: Boolean(data.isAdmin) };
}

export function optionalAuthHeaders(): HeadersInit {
  const token = getCreatorToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function requireAuthHeaders(): HeadersInit {
  return { ...sessionHeaders(), 'Content-Type': 'application/json' };
}
