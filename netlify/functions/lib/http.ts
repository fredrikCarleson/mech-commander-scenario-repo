/** CORS headers for browser-based game clients. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function withCors(headers: Record<string, string> = {}): Record<string, string> {
  return { ...CORS_HEADERS, ...headers };
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: withCors() });
}

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    }),
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
} {
  const normalized = pathname.replace(/\/+$/, '');
  const adminMatch = normalized.match(/\/api\/v1\/admin\/scenarios(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (adminMatch) {
    return {
      resource: 'admin-scenarios',
      id: adminMatch[1] ?? null,
      action: adminMatch[2] ?? null,
    };
  }

  const match = normalized.match(/\/api\/v1\/scenarios(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!match) {
    return { resource: null, id: null, action: null };
  }

  return {
    resource: 'scenarios',
    id: match[1] ?? null,
    action: match[2] ?? null,
  };
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
  return new Response(bytes, { status, headers: withCors(headers) });
}
