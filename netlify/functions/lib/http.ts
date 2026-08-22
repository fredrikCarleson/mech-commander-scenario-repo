import { isCorsOriginAllowed } from './community-environment.ts';

export function applyCors(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin');
  if (!origin) return response;
  if (!isCorsOriginAllowed(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, Idempotency-Key',
  );
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflightResponse(request: Request): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !isCorsOriginAllowed(origin)) {
    return jsonResponse(403, { error: 'Origin is not allowed.' });
  }
  return applyCors(new Response(null, { status: 204 }), request);
}

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function errorResponse(status: number, error: string, details?: string[]): Response {
  return jsonResponse(status, {
    error,
    ...(details && details.length > 0 ? { details } : {}),
  });
}

export function parseApiPath(pathname: string): {
  resource: string | null;
  id: string | null;
  action: string | null;
  revision: number | null;
} {
  const normalized = pathname.replace(/\/+$/, '');
  const releaseMatch = normalized.match(
    /\/api\/v1\/(scenarios|campaigns)\/([^/]+)\/releases\/([1-9][0-9]*)(?:\/(download|thumbnail))?$/,
  );
  if (releaseMatch) {
    return {
      resource: releaseMatch[1] ?? null,
      id: releaseMatch[2] ?? null,
      action: releaseMatch[4] ?? 'release',
      revision: Number(releaseMatch[3]),
    };
  }
  const authMatch = normalized.match(/\/api\/v1\/auth(?:\/([^/]+))?$/);
  if (authMatch) {
    return {
      resource: 'auth',
      id: null,
      action: authMatch[1] ?? null,
      revision: null,
    };
  }
  const adminMatch = normalized.match(/\/api\/v1\/admin\/scenarios(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (adminMatch) {
    return {
      resource: 'admin-scenarios',
      id: adminMatch[1] ?? null,
      action: adminMatch[2] ?? null,
      revision: null,
    };
  }

  const adminCampaignMatch = normalized.match(
    /\/api\/v1\/admin\/campaigns(?:\/([^/]+))?(?:\/([^/]+))?$/,
  );
  if (adminCampaignMatch) {
    return {
      resource: 'admin-campaigns',
      id: adminCampaignMatch[1] ?? null,
      action: adminCampaignMatch[2] ?? null,
      revision: null,
    };
  }

  const supportMatch = normalized.match(/\/api\/v1\/support(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (supportMatch) {
    return {
      resource: 'support',
      id: supportMatch[1] ?? null,
      action: supportMatch[2] ?? null,
      revision: null,
    };
  }

  const campaignMatch = normalized.match(/\/api\/v1\/campaigns(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (campaignMatch) {
    return {
      resource: 'campaigns',
      id: campaignMatch[1] ?? null,
      action: campaignMatch[2] ?? null,
      revision: null,
    };
  }

  const match = normalized.match(/\/api\/v1\/scenarios(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!match) {
    return { resource: null, id: null, action: null, revision: null };
  }

  return {
    resource: 'scenarios',
    id: match[1] ?? null,
    action: match[2] ?? null,
    revision: null,
  };
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      throw new HttpBodyError(400, 'Content-Length is invalid.');
    }
    if (declaredLength > maxBytes) {
      throw new HttpBodyError(413, `Request body exceeds ${maxBytes} bytes.`);
    }
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new HttpBodyError(413, `Request body exceeds ${maxBytes} bytes.`);
  }
  return bytes;
}

export class HttpBodyError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpBodyError';
  }
}

export function isZipContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.split(';')[0]?.trim().toLowerCase();
  return (
    normalized === 'application/zip' ||
    normalized === 'application/octet-stream' ||
    normalized === 'application/x-zip-compressed'
  );
}

export function binaryResponse(
  status: number,
  bytes: Uint8Array,
  headers: Record<string, string>,
): Response {
  return new Response(bytes, { status, headers });
}
