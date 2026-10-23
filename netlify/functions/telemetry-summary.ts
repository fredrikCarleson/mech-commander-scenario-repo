import {
  BlobStoreLike,
  corsPreflightResponse,
  generateTelemetrySummary,
  getDefaultTelemetryStore,
  jsonResponse,
  verifyAdminKey,
} from './lib/telemetry-service.ts';

export async function handleTelemetrySummaryRequest(
  request: Request,
  customStore?: BlobStoreLike,
): Promise<Response> {
  const method = request.method.toUpperCase();

  // Handle CORS OPTIONS preflight
  if (method === 'OPTIONS') {
    return corsPreflightResponse(request, 'GET, OPTIONS');
  }

  // Only accept GET
  if (method !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed. Use GET.' }, request, 'GET, OPTIONS');
  }

  // Ensure TELEMETRY_ADMIN_KEY is configured
  if (!process.env.TELEMETRY_ADMIN_KEY?.trim()) {
    return jsonResponse(
      500,
      { error: 'TELEMETRY_ADMIN_KEY is not configured in the server environment.' },
      request,
      'GET, OPTIONS',
    );
  }

  // Authenticate admin key header
  if (!verifyAdminKey(request)) {
    return jsonResponse(
      401,
      {
        error:
          'Unauthorized. Provide a valid TELEMETRY_ADMIN_KEY via X-Admin-Key or Authorization header.',
      },
      request,
      'GET, OPTIONS',
    );
  }

  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) || 7 : 7;

    const store = customStore || getDefaultTelemetryStore();
    const summary = await generateTelemetrySummary(days, store);

    return jsonResponse(200, summary, request, 'GET, OPTIONS');
  } catch (err: unknown) {
    console.error('Error generating telemetry summary:', err);
    return jsonResponse(
      500,
      { error: 'Internal Server Error generating telemetry summary.' },
      request,
      'GET, OPTIONS',
    );
  }
}

export default async function handler(request: Request): Promise<Response> {
  return handleTelemetrySummaryRequest(request);
}
