import { createNetlifyBlobStore } from './lib/netlify-blob-store.ts';
import { createNetlifyCampaignBlobStore } from './lib/netlify-campaign-blob-store.ts';

import {
  AuthError,
  isAdminSubject,
  issueCreatorSession,
  requireAdmin,
  requireCreator,
  verifyGoogleIdentityToken,
} from './lib/auth.ts';

import { ScenarioService, ServiceError } from './lib/scenario-service.ts';
import { CampaignService } from './lib/campaign-service.ts';
import { SupportService } from './lib/support-service.ts';
import { createNetlifySupportBlobStore } from './lib/netlify-support-blob-store.ts';

import {
  DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES,
  DEFAULT_MAX_COMPRESSED_BYTES,
} from '../../shared/constants.ts';

import {
  binaryResponse,
  applyCors,
  corsPreflightResponse,
  errorResponse,
  HttpBodyError,
  isZipContentType,
  jsonResponse,
  parseApiPath,
  readBoundedBody,
} from './lib/http.ts';
import { assertMutationEnabled } from './lib/community-environment.ts';

export default async function handler(request: Request): Promise<Response> {
  if (request.method.toUpperCase() === 'OPTIONS') {
    return corsPreflightResponse(request);
  }

  return applyCors(await routeRequest(request), request);
}

async function routeRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();

  const url = new URL(request.url);

  const { resource, id, action, revision } = parseApiPath(url.pathname);

  try {
    const service = new ScenarioService(createNetlifyBlobStore());
    const campaignService = new CampaignService(createNetlifyCampaignBlobStore());
    if (resource === 'auth') {
      if (action === 'session' && method === 'POST') {
        assertMutationEnabled();
        const body = await readJsonBody(request);
        const identityToken =
          body && typeof body === 'object' && 'identityToken' in body
            ? (body as { identityToken?: unknown }).identityToken
            : undefined;
        const expectedNonce =
          body && typeof body === 'object' && 'nonce' in body
            ? (body as { nonce?: unknown }).nonce
            : undefined;
        if (typeof identityToken !== 'string' || !identityToken) {
          return errorResponse(400, 'Google identity token is required.');
        }
        if (
          typeof expectedNonce !== 'string' ||
          expectedNonce.length < 16 ||
          expectedNonce.length > 256
        ) {
          return errorResponse(400, 'OAuth nonce is required.');
        }
        const identity = await verifyGoogleIdentityToken(identityToken, expectedNonce);
        const session = await issueCreatorSession(identity);
        return jsonResponse(200, {
          ...session,
          email: identity.email,
          role: 'creator',
        });
      }
      if (action === 'me' && method === 'GET') {
        const creator = await requireCreator(request);
        return jsonResponse(200, {
          email: creator.email,
          role: 'creator',
          isAdmin: isAdminSubject(creator.sub),
        });
      }
      return errorResponse(405, 'Method not allowed.');
    }

    if (resource === 'admin-scenarios') {
      assertMutationEnabled();
      const admin = await requireAdmin(request);

      if (!id && method === 'GET') {
        const items = await service.listPendingScenarios();

        return jsonResponse(200, { items, total: items.length });
      }

      if (id && !action && method === 'GET') {
        const metadata = await service.getScenarioAdmin(id);

        if (!metadata) {
          return errorResponse(404, 'Scenario not found.');
        }

        return jsonResponse(200, metadata);
      }

      if (id && action === 'thumbnail' && method === 'GET') {
        const thumbnail = await service.getThumbnailAdmin(id);

        if (!thumbnail) {
          return errorResponse(404, 'Thumbnail not found.');
        }

        return binaryResponse(200, thumbnail, {
          'Content-Type': 'image/webp',

          'Cache-Control': 'private, max-age=300',
        });
      }

      if (id && action === 'approve' && method === 'POST') {
        const command = parseModerationCommand(await readJsonBody(request), false);
        const metadata = await service.approveScenario(id, command.revision, admin);

        return jsonResponse(200, { id: metadata.id, metadata });
      }

      if (id && action === 'reject' && method === 'POST') {
        const command = parseModerationCommand(await readJsonBody(request), true);
        const metadata = await service.rejectScenario(id, command.revision, command.reason!, admin);

        return jsonResponse(200, { id: metadata.id, metadata });
      }

      if (id && action === 'rollback' && method === 'POST') {
        const command = parseModerationCommand(await readJsonBody(request), false);
        const metadata = await service.rollbackScenario(id, command.revision, admin);
        return jsonResponse(200, { id: metadata.id, metadata });
      }

      if (id && action === 'owner' && method === 'POST') {
        const body = await readJsonBody(request);
        const identityToken =
          body && typeof body === 'object' && 'identityToken' in body
            ? (body as { identityToken?: unknown }).identityToken
            : undefined;
        if (typeof identityToken !== 'string' || !identityToken) {
          return errorResponse(400, 'Owner Google identity token is required.');
        }
        const owner = await verifyGoogleIdentityToken(identityToken);
        await service.assignScenarioOwner(id, owner);
        return jsonResponse(200, { id, ownerAssigned: true, ownerEmail: owner.email });
      }

      if (id && !action && method === 'DELETE') {
        await service.deleteScenario(id, admin);

        return jsonResponse(200, { id, deleted: true });
      }

      return errorResponse(405, 'Method not allowed.');
    }

    if (resource === 'admin-campaigns') {
      assertMutationEnabled();
      const admin = await requireAdmin(request);
      if (!id && method === 'GET') {
        const items = await campaignService.listPendingCampaigns();
        return jsonResponse(200, { items, total: items.length });
      }
      if (id && !action && method === 'GET') {
        const metadata = await campaignService.getCampaignAdmin(id);
        return metadata ? jsonResponse(200, metadata) : errorResponse(404, 'Campaign not found.');
      }
      if (id && action === 'thumbnail' && method === 'GET') {
        const thumbnail = await campaignService.getThumbnailAdmin(id);
        return thumbnail
          ? binaryResponse(200, thumbnail, {
              'Content-Type': 'image/webp',
              'Cache-Control': 'private, max-age=300',
            })
          : errorResponse(404, 'Thumbnail not found.');
      }
      if (id && action === 'approve' && method === 'POST') {
        const command = parseModerationCommand(await readJsonBody(request), false);
        const metadata = await campaignService.approveCampaign(id, command.revision, admin);
        return jsonResponse(200, { id, metadata });
      }
      if (id && action === 'reject' && method === 'POST') {
        const command = parseModerationCommand(await readJsonBody(request), true);
        const metadata = await campaignService.rejectCampaign(
          id,
          command.revision,
          command.reason!,
          admin,
        );
        return jsonResponse(200, { id, metadata });
      }
      if (id && action === 'rollback' && method === 'POST') {
        const command = parseModerationCommand(await readJsonBody(request), false);
        const metadata = await campaignService.rollbackCampaign(id, command.revision, admin);
        return jsonResponse(200, { id, metadata });
      }
      if (id && action === 'owner' && method === 'POST') {
        const body = await readJsonBody(request);
        const identityToken =
          body && typeof body === 'object' && 'identityToken' in body
            ? (body as { identityToken?: unknown }).identityToken
            : undefined;
        if (typeof identityToken !== 'string' || !identityToken) {
          return errorResponse(400, 'Owner Google identity token is required.');
        }
        const owner = await verifyGoogleIdentityToken(identityToken);
        await campaignService.assignCampaignOwner(id, owner);
        return jsonResponse(200, { id, ownerAssigned: true, ownerEmail: owner.email });
      }
      if (id && !action && method === 'DELETE') {
        await campaignService.deleteCampaign(id, admin);
        return jsonResponse(200, { id, deleted: true });
      }
      return errorResponse(405, 'Method not allowed.');
    }

    if (resource === 'campaigns') {
      if (!id && method === 'GET') {
        return jsonResponse(
          200,
          await campaignService.listCampaigns(Object.fromEntries(url.searchParams.entries())),
        );
      }
      if (!id && method === 'POST') {
        assertMutationEnabled();
        const creator = await requireCreator(request);
        if (!isZipContentType(request.headers.get('content-type'))) {
          return errorResponse(415, 'Upload requires a ZIP content type.');
        }
        const body = await readBoundedBody(request, DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES);
        if (body.byteLength === 0) return errorResponse(400, 'Request body is empty.');
        const metadata = await campaignService.uploadCampaign(body, creator);
        return jsonResponse(201, { id: metadata.id, metadata });
      }
      if (id && !action && method === 'PUT') {
        assertMutationEnabled();
        const creator = await requireCreator(request);
        if (!isZipContentType(request.headers.get('content-type'))) {
          return errorResponse(415, 'Update requires a ZIP content type.');
        }
        const body = await readBoundedBody(request, DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES);
        if (body.byteLength === 0) return errorResponse(400, 'Request body is empty.');
        const metadata = await campaignService.updateCampaign(id, body, creator);
        return jsonResponse(200, { id, metadata });
      }
      if (id && action === 'status' && method === 'GET') {
        const status = await campaignService.getSubmissionStatus(id, await requireCreator(request));
        return status ? jsonResponse(200, status) : errorResponse(404, 'Campaign not found.');
      }
      if (id && !action && method === 'DELETE') {
        assertMutationEnabled();
        const metadata = await campaignService.withdrawCampaign(id, await requireCreator(request));
        return jsonResponse(200, { id, deleted: false, metadata });
      }
      if (id && !action && method === 'GET') {
        const metadata = await campaignService.getCampaign(id);
        return metadata ? jsonResponse(200, metadata) : errorResponse(404, 'Campaign not found.');
      }
      if (id && revision && action === 'release' && method === 'GET') {
        const metadata = await campaignService.getCampaignRelease(id, revision);
        return metadata
          ? jsonResponse(200, metadata)
          : errorResponse(404, 'Campaign release not found.');
      }
      if (id && revision && action === 'thumbnail' && method === 'GET') {
        const thumbnail = await campaignService.getThumbnail(id, revision);
        return thumbnail
          ? binaryResponse(200, thumbnail, {
              'Content-Type': 'image/webp',
              'Cache-Control': 'public, max-age=31536000, immutable',
            })
          : errorResponse(404, 'Campaign release thumbnail not found.');
      }
      if (id && revision && action === 'download' && method === 'GET') {
        const result = await campaignService.downloadCampaign(id, revision);
        return result
          ? binaryResponse(200, result.packageBytes, {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="${result.metadata.stableCampaignId}-r${revision}.zip"`,
              'X-Checksum-Sha256': result.metadata.checksumSha256,
              'X-Community-Release-Id': result.metadata.releaseId ?? `${id}:r${revision}`,
              'Cache-Control': 'public, max-age=31536000, immutable',
            })
          : errorResponse(404, 'Campaign release not found.');
      }
      if (id && action === 'thumbnail' && method === 'GET') {
        const thumbnail = await campaignService.getThumbnail(id);
        return thumbnail
          ? binaryResponse(200, thumbnail, {
              'Content-Type': 'image/webp',
              'Cache-Control': 'public, max-age=3600',
            })
          : errorResponse(404, 'Thumbnail not found.');
      }
      if (id && action === 'download' && method === 'GET') {
        const result = await campaignService.downloadCampaign(id);
        return result
          ? binaryResponse(200, result.packageBytes, {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="${result.metadata.stableCampaignId}.zip"`,
              'X-Checksum-Sha256': result.metadata.checksumSha256,
              'Cache-Control': 'no-store',
            })
          : errorResponse(404, 'Campaign not found.');
      }
      if (id && action === 'ratings' && method === 'POST') {
        return jsonResponse(
          200,
          await campaignService.submitRating(id, await readJsonBody(request)),
        );
      }
      return errorResponse(405, 'Method not allowed.');
    }

    if (resource === 'support') {
      const supportService = new SupportService(createNetlifySupportBlobStore());
      if (!id && method === 'GET') {
        const viewer = await optionalCreator(request);
        return jsonResponse(
          200,
          await supportService.listTickets(Object.fromEntries(url.searchParams.entries()), viewer),
        );
      }
      if (!id && method === 'POST') {
        assertMutationEnabled();
        const creator = await requireCreator(request);
        const ticket = await supportService.createTicket(await readJsonBody(request), creator);
        return jsonResponse(201, ticket);
      }
      if (id && !action && method === 'GET') {
        const viewer = await optionalCreator(request);
        const ticket = await supportService.getTicket(id, viewer);
        return ticket ? jsonResponse(200, ticket) : errorResponse(404, 'Support ticket not found.');
      }
      if (id && !action && method === 'PUT') {
        assertMutationEnabled();
        const creator = await requireCreator(request);
        const ticket = await supportService.updateTicket(id, await readJsonBody(request), creator);
        return jsonResponse(200, ticket);
      }
      if (id && action === 'votes' && method === 'POST') {
        assertMutationEnabled();
        const creator = await requireCreator(request);
        return jsonResponse(200, await supportService.toggleVote(id, creator));
      }
      if (id && action === 'status' && method === 'POST') {
        assertMutationEnabled();
        const admin = await requireAdmin(request);
        return jsonResponse(
          200,
          await supportService.updateStatus(id, await readJsonBody(request), admin),
        );
      }
      return errorResponse(405, 'Method not allowed.');
    }

    if (resource !== 'scenarios') {
      return errorResponse(404, 'Not found.');
    }

    if (!id && method === 'GET') {
      const query = Object.fromEntries(url.searchParams.entries());

      const result = await service.listScenarios(query);

      return jsonResponse(200, result);
    }

    if (!id && method === 'POST') {
      assertMutationEnabled();
      const creator = await requireCreator(request);

      const contentType = request.headers.get('content-type');

      if (!isZipContentType(contentType)) {
        return errorResponse(
          415,

          'Upload requires Content-Type application/zip or application/octet-stream.',
        );
      }

      const body = await readBoundedBody(request, DEFAULT_MAX_COMPRESSED_BYTES);

      if (body.byteLength === 0) {
        return errorResponse(400, 'Request body is empty.');
      }

      const metadata = await service.uploadScenario(body, creator);

      return jsonResponse(201, { id: metadata.id, metadata });
    }

    if (id && !action && method === 'PUT') {
      assertMutationEnabled();
      const creator = await requireCreator(request);
      const contentType = request.headers.get('content-type');

      if (!isZipContentType(contentType)) {
        return errorResponse(
          415,

          'Update requires Content-Type application/zip or application/octet-stream.',
        );
      }

      const body = await readBoundedBody(request, DEFAULT_MAX_COMPRESSED_BYTES);

      if (body.byteLength === 0) {
        return errorResponse(400, 'Request body is empty.');
      }

      const metadata = await service.updateScenario(id, body, creator);

      return jsonResponse(200, { id: metadata.id, metadata });
    }

    if (id && action === 'status' && method === 'GET') {
      const creator = await requireCreator(request);
      const status = await service.getSubmissionStatus(id, creator);

      if (!status) {
        return errorResponse(404, 'Scenario not found.');
      }

      return jsonResponse(200, status);
    }

    if (id && !action && method === 'DELETE') {
      assertMutationEnabled();
      const creator = await requireCreator(request);
      const metadata = await service.withdrawScenario(id, creator);
      return jsonResponse(200, { id, deleted: false, metadata });
    }

    if (id && !action && method === 'GET') {
      const metadata = await service.getScenario(id);

      if (!metadata) {
        return errorResponse(404, 'Scenario not found.');
      }

      return jsonResponse(200, metadata);
    }

    if (id && revision && action === 'release' && method === 'GET') {
      const metadata = await service.getScenarioRelease(id, revision);
      return metadata
        ? jsonResponse(200, metadata)
        : errorResponse(404, 'Scenario release not found.');
    }

    if (id && revision && action === 'thumbnail' && method === 'GET') {
      const thumbnail = await service.getThumbnail(id, revision);
      return thumbnail
        ? binaryResponse(200, thumbnail, {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
          })
        : errorResponse(404, 'Scenario release thumbnail not found.');
    }

    if (id && revision && action === 'download' && method === 'GET') {
      const result = await service.downloadScenario(id, revision);
      return result
        ? binaryResponse(200, result.packageBytes, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${id}-r${revision}.zip"`,
            'X-Checksum-Sha256': result.metadata.checksumSha256,
            'X-Community-Release-Id': result.metadata.releaseId ?? `${id}:r${revision}`,
            'Cache-Control': 'public, max-age=31536000, immutable',
          })
        : errorResponse(404, 'Scenario release not found.');
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
      const body = await readJsonBody(request);

      const result = await service.submitRating(id, body);

      return jsonResponse(200, result);
    }

    return errorResponse(405, 'Method not allowed.');
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.statusCode, error.message);
    }

    if (error instanceof ServiceError) {
      return errorResponse(error.statusCode, error.message, error.details);
    }

    if (error instanceof HttpBodyError) {
      return errorResponse(error.statusCode, error.message);
    }

    if (error instanceof Error && 'statusCode' in error && error.statusCode === 503) {
      return errorResponse(503, error.message);
    }

    console.error('Unhandled API error', error);

    return errorResponse(500, 'Internal server error.');
  }
}

async function optionalCreator(request: Request) {
  if (!request.headers.get('Authorization')) return null;
  return requireCreator(request);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const bytes = await readBoundedBody(request, 64 * 1024);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof HttpBodyError) throw error;
    throw new ServiceError(400, 'Request body must be valid JSON.');
  }
}

function parseModerationCommand(
  body: unknown,
  requireReason: boolean,
): { revision: number; reason?: string } {
  if (!body || typeof body !== 'object') {
    throw new ServiceError(400, 'Moderation command must be a JSON object.');
  }
  const revision = (body as { revision?: unknown }).revision;
  const reason = (body as { reason?: unknown }).reason;
  if (!Number.isInteger(revision) || (revision as number) < 1) {
    throw new ServiceError(400, 'Moderation command requires a positive revision.');
  }
  if (
    requireReason &&
    (typeof reason !== 'string' || reason.trim().length < 1 || reason.trim().length > 1000)
  ) {
    throw new ServiceError(400, 'Rejection reason must contain 1 to 1000 characters.');
  }
  return { revision: revision as number, ...(typeof reason === 'string' ? { reason } : {}) };
}
