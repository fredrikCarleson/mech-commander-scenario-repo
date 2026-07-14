import { createNetlifyBlobStore } from './lib/netlify-blob-store.ts';
import { ScenarioService, ServiceError } from './lib/scenario-service.ts';
import {
  binaryResponse,
  errorResponse,
  isZipContentType,
  jsonResponse,
  parseApiPath,
} from './lib/http.ts';

export default async function handler(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const { resource, id, action } = parseApiPath(url.pathname);

  if (resource !== 'scenarios') {
    return errorResponse(404, 'Not found.');
  }

  const service = new ScenarioService(createNetlifyBlobStore());

  try {
    if (!id && method === 'GET') {
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await service.listScenarios(query);
      return jsonResponse(200, result);
    }

    if (!id && method === 'POST') {
      const contentType = request.headers.get('content-type');
      if (!isZipContentType(contentType)) {
        return errorResponse(
          415,
          'Upload requires Content-Type application/zip or application/octet-stream.',
        );
      }

      const body = new Uint8Array(await request.arrayBuffer());
      if (body.byteLength === 0) {
        return errorResponse(400, 'Request body is empty.');
      }

      const metadata = await service.uploadScenario(body);
      return jsonResponse(201, { id: metadata.id, metadata });
    }

    if (id && !action && method === 'GET') {
      const metadata = await service.getScenario(id);
      if (!metadata) {
        return errorResponse(404, 'Scenario not found.');
      }
      return jsonResponse(200, metadata);
    }

    if (id && action === 'thumbnail' && method === 'GET') {
      const thumbnail = await service.getThumbnail(id);
      if (!thumbnail) {
        return errorResponse(404, 'Thumbnail not found.');
      }

      return binaryResponse(200, thumbnail, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=3600',
      });
    }

    if (id && action === 'download' && method === 'GET') {
      const result = await service.downloadScenario(id);
      if (!result) {
        return errorResponse(404, 'Scenario not found.');
      }

      return binaryResponse(200, result.packageBytes, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${id}.zip"`,
        'X-Checksum-Sha256': result.metadata.checksumSha256,
        'Cache-Control': 'no-store',
      });
    }

    if (id && action === 'ratings' && method === 'POST') {
      let body: unknown = {};
      try {
        body = await request.json();
      } catch {
        return errorResponse(400, 'Request body must be valid JSON.');
      }

      const result = await service.submitRating(id, body);
      return jsonResponse(200, result);
    }

    return errorResponse(405, 'Method not allowed.');
  } catch (error) {
    if (error instanceof ServiceError) {
      return errorResponse(error.statusCode, error.message, error.details);
    }

    console.error('Unhandled API error', error);
    return errorResponse(500, 'Internal server error.');
  }
}
