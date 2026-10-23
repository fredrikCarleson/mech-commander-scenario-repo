import {
  BlobStoreLike,
  corsPreflightResponse,
  getDefaultTelemetryStore,
  jsonResponse,
  noContentResponse,
  parseTelemetryPayload,
  processAndStoreEvents,
  readBoundedTelemetryBody,
  TelemetryPayloadTooLargeError,
  TelemetryValidationError,
} from './lib/telemetry-service.ts';

export async function handleTelemetryRequest(
  request: Request,
  customStore?: BlobStoreLike,
): Promise<Response> {
  const method = request.method.toUpperCase();

  // Handle CORS OPTIONS preflight
  if (method === 'OPTIONS') {
    return corsPreflightResponse(request, 'POST, OPTIONS');
  }

  // Only accept POST
  if (method !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed. Use POST.' }, request, 'POST, OPTIONS');
  }

  try {
    const rawBody = await readBoundedTelemetryBody(request);
    const events = parseTelemetryPayload(rawBody);

    const store = customStore || getDefaultTelemetryStore();
    await processAndStoreEvents(events, store);

    // Respond 204 on success
    return noContentResponse(request);
  } catch (err: unknown) {
    if (err instanceof TelemetryPayloadTooLargeError) {
      return jsonResponse(413, { error: err.message }, request, 'POST, OPTIONS');
    }
    if (err instanceof TelemetryValidationError) {
      return jsonResponse(400, { error: err.message }, request, 'POST, OPTIONS');
    }

    console.error('Unexpected telemetry error:', err);
    return jsonResponse(
      500,
      { error: 'Internal Server Error processing telemetry.' },
      request,
      'POST, OPTIONS',
    );
  }
}

export default async function handler(request: Request): Promise<Response> {
  return handleTelemetryRequest(request);
}
