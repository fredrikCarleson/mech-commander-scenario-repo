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
} {
  const normalized = pathname.replace(/\/+$/, '');
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
  return new Response(bytes, { status, headers });
}
