import type { HandlerEvent } from '@netlify/functions';

export function jsonResponse(
  statusCode: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, error: string, details?: string[]) {
  return jsonResponse(statusCode, {
    error,
    ...(details && details.length > 0 ? { details } : {}),
  });
}

export function getQueryParams(event: HandlerEvent): URLSearchParams {
  return event.queryStringParameters
    ? new URLSearchParams(
        Object.entries(event.queryStringParameters).flatMap(([key, value]) =>
          value == null ? [] : [[key, value]],
        ),
      )
    : new URLSearchParams();
}

export function parseApiPath(path: string): {
  resource: string | null;
  id: string | null;
  action: string | null;
} {
  const normalized = path.replace(/\/+$/, '');
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

export function decodeBody(event: HandlerEvent): Uint8Array {
  if (!event.body) {
    return new Uint8Array();
  }

  if (event.isBase64Encoded) {
    const binary = Buffer.from(event.body, 'base64');
    return new Uint8Array(binary);
  }

  return new TextEncoder().encode(event.body);
}

export function isZipContentType(contentType: string | undefined): boolean {
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
