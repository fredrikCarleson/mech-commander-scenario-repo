import type { Handler, HandlerEvent } from '@netlify/functions';
import { createNetlifyBlobStore } from './lib/netlify-blob-store.ts';
import { ScenarioService, ServiceError } from './lib/scenario-service.ts';
import {
  decodeBody,
  errorResponse,
  getQueryParams,
  isZipContentType,
  jsonResponse,
  parseApiPath,
} from './lib/http.ts';

function getService(): ScenarioService {
  return new ScenarioService(createNetlifyBlobStore());
}

function getPath(event: HandlerEvent): string {
  return event.rawPath ?? event.path;
}

export const handler: Handler = async (event) => {
  const method = event.httpMethod.toUpperCase();
  const path = getPath(event);
  const { resource, id, action } = parseApiPath(path);

  if (resource !== 'scenarios') {
    return errorResponse(404, 'Not found.');
  }

  const service = getService();

  try {
    if (!id && method === 'GET') {
      const query = Object.fromEntries(getQueryParams(event).entries());
      const result = await service.listScenarios(query);
      return jsonResponse(200, result);
    }

    if (!id && method === 'POST') {
      const contentType = event.headers['content-type'] ?? event.headers['Content-Type'];
      if (!isZipContentType(contentType)) {
        return errorResponse(
          415,
          'Upload requires Content-Type application/zip or application/octet-stream.',
        );
      }

      const body = decodeBody(event);
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

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=3600',
        },
        body: Buffer.from(thumbnail).toString('base64'),
        isBase64Encoded: true,
      };
    }

    if (id && action === 'download' && method === 'GET') {
      const result = await service.downloadScenario(id);
      if (!result) {
        return errorResponse(404, 'Scenario not found.');
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${id}.zip"`,
          'X-Checksum-Sha256': result.metadata.checksumSha256,
          'Cache-Control': 'no-store',
        },
        body: Buffer.from(result.packageBytes).toString('base64'),
        isBase64Encoded: true,
      };
    }

    if (id && action === 'ratings' && method === 'POST') {
      let body: unknown = {};
      if (event.body) {
        try {
          body = JSON.parse(
            event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body,
          );
        } catch {
          return errorResponse(400, 'Request body must be valid JSON.');
        }
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
};
