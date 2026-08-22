import { strFromU8 } from 'fflate';
import { z } from 'zod';
import {
  COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES,
  COMMUNITY_MAX_CAMPAIGN_ZIP_ENTRIES,
  DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES,
  DEFAULT_MAX_CAMPAIGN_DECOMPRESSED_BYTES,
  SUPPORTED_GAME_VERSIONS,
} from '../constants.ts';
import {
  campaignManifestSchema,
  portableCampaignSchema,
  type CampaignManifest,
  type PortableCampaign,
} from '../schemas/campaign.ts';
import { gameScenarioFileSchema, validateGameScenarioSemantics } from '../schemas/scenario-file.ts';
import { COMMUNITY_IMAGE_MIME_BY_EXTENSION, inspectCommunityImage } from './image-validation.ts';
import { hasDangerousExtension } from './zip-security.ts';
import { unzipSafe } from './safe-zip.ts';

const ALLOWED_DATA_EXTENSIONS = new Set(['.json', '.md']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(Object.keys(COMMUNITY_IMAGE_MIME_BY_EXTENSION));
const SCENARIO_IMAGE_NAMES = new Set([
  'scenariomap.png',
  'scenariomap.jpg',
  'scenariomap.jpeg',
  'scenariomap.webp',
]);
const SIMPLE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MEDIA_ROLE =
  /^(theater-art|intro-slide:[A-Za-z0-9_-]{1,64}|aftermath-slide:[A-Za-z0-9_-]{1,64})$/;

const dialogueSchema = z
  .object({
    missionId: z.string().min(1).max(64),
    pre: z.array(z.unknown()).max(16),
    post: z.unknown().optional(),
  })
  .passthrough();

const mediaManifestSchema = z.object({
  version: z.literal(1),
  assets: z
    .array(
      z.object({
        role: z.string().regex(MEDIA_ROLE),
        fileName: z.string().regex(SIMPLE_FILE_NAME),
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      }),
    )
    .max(64),
});

function extension(path: string): string {
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index).toLowerCase() : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllowedCampaignPath(path: string, stableCampaignId: string): boolean {
  if (path === 'manifest.json' || path === 'thumbnail.webp') return true;
  const folder = `Campaigns/${escapeRegExp(stableCampaignId)}/`;
  return (
    new RegExp(`^${folder}(?:campaign\\.json|README\\.md|PACK\\.md)$`).test(path) ||
    new RegExp(`^${folder}dialogues/[A-Za-z0-9_-]{1,64}\\.json$`).test(path) ||
    new RegExp(
      `^${folder}missions/[A-Za-z0-9_-]{1,64}/(?:scenario\\.json|scenariomap\\.(?:png|jpe?g|webp))$`,
    ).test(path) ||
    new RegExp(
      `^${folder}media/(?:manifest\\.json|ASSETS\\.md|[A-Za-z0-9][A-Za-z0-9._-]{0,127})$`,
    ).test(path) ||
    /^Scenarios\/[A-Za-z0-9_-]{1,64}\/(?:scenario\.json|scenariomap\.(?:png|jpe?g|webp))$/.test(
      path,
    )
  );
}

function parseJson<T>(label: string, bytes: Uint8Array, schema: z.ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(strFromU8(bytes, true));
  } catch {
    throw new Error(`${label} contains malformed JSON.`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `${label} failed validation: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }
  return parsed.data;
}

function forbiddenVideoField(value: unknown, path = 'campaign'): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const found = forbiddenVideoField(child, `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().startsWith('video')) return `${path}.${key}`;
    const found = forbiddenVideoField(child, `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
}

function validateImage(path: string, bytes: Uint8Array, declaredMime?: string): string | undefined {
  if (bytes.byteLength > COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES) {
    return `${path} exceeds the ${COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES}-byte image limit.`;
  }
  const mime =
    COMMUNITY_IMAGE_MIME_BY_EXTENSION[
      extension(path) as keyof typeof COMMUNITY_IMAGE_MIME_BY_EXTENSION
    ];
  if (!mime) return `${path} does not use an allowed image extension.`;
  if (declaredMime && declaredMime !== mime) {
    return `${path} extension requires ${mime}, not ${declaredMime}.`;
  }
  try {
    inspectCommunityImage(bytes, mime);
  } catch (error) {
    return `${path} failed image validation: ${error instanceof Error ? error.message : 'Invalid image.'}`;
  }
  return undefined;
}

export type CampaignPackageValidationResult =
  | {
      ok: true;
      contents: {
        manifest: CampaignManifest;
        campaign: PortableCampaign;
        thumbnail: Uint8Array;
        orderedMissionIds: string[];
      };
    }
  | { ok: false; errors: string[] };

export async function validateCampaignPackage(
  compressedBytes: Uint8Array,
  options: { maxCompressedBytes?: number; maxDecompressedBytes?: number } = {},
): Promise<CampaignPackageValidationResult> {
  const maxCompressed = options.maxCompressedBytes ?? DEFAULT_MAX_CAMPAIGN_COMPRESSED_BYTES;
  const maxDecompressed = options.maxDecompressedBytes ?? DEFAULT_MAX_CAMPAIGN_DECOMPRESSED_BYTES;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSafe(compressedBytes, {
      maxCompressedBytes: maxCompressed,
      maxDecompressedBytes: maxDecompressed,
      maxEntries: COMMUNITY_MAX_CAMPAIGN_ZIP_ENTRIES,
    });
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : 'Invalid ZIP.'] };
  }

  const errors: string[] = [];
  const paths = Object.keys(files);
  for (const path of paths) {
    const ext = extension(path);
    if (
      hasDangerousExtension(path) ||
      (!ALLOWED_DATA_EXTENSIONS.has(ext) && !ALLOWED_IMAGE_EXTENSIONS.has(ext))
    ) {
      errors.push(`Unsupported or dangerous campaign package file: ${path}`);
    }
  }
  const manifestBytes = files['manifest.json'];
  const thumbnail = files['thumbnail.webp'];
  if (!manifestBytes) errors.push('Missing required file: manifest.json');
  if (!thumbnail) errors.push('Missing required file: thumbnail.webp');
  if (thumbnail) {
    const imageError = validateImage('thumbnail.webp', thumbnail, 'image/webp');
    if (imageError) errors.push(imageError);
  }

  const campaignPaths = paths.filter((path) => /^Campaigns\/[^/]+\/campaign\.json$/.test(path));
  if (campaignPaths.length !== 1) {
    errors.push('Package must contain exactly one Campaigns/<id>/campaign.json.');
  }
  if (errors.length > 0 || !manifestBytes || !thumbnail || campaignPaths.length !== 1) {
    return { ok: false, errors };
  }

  try {
    const manifest = parseJson('manifest.json', manifestBytes, campaignManifestSchema);
    const campaignPath = campaignPaths[0]!;
    const campaignUnknown = JSON.parse(strFromU8(files[campaignPath]!, true)) as unknown;
    const videoField = forbiddenVideoField(campaignUnknown);
    if (videoField) errors.push(`Community campaigns cannot contain video field ${videoField}.`);
    const campaign = parseJson(campaignPath, files[campaignPath]!, portableCampaignSchema);
    const campaignFolder = `Campaigns/${manifest.stableCampaignId}/`;
    for (const path of paths) {
      if (!isAllowedCampaignPath(path, manifest.stableCampaignId)) {
        errors.push(`Unexpected campaign package path: ${path}.`);
      }
    }
    if (campaignPath !== `${campaignFolder}campaign.json`) {
      errors.push('Campaign folder name must exactly match manifest stableCampaignId.');
    }
    if (manifest.stableCampaignId !== campaign.id) {
      errors.push('Manifest stableCampaignId must match campaign.json id.');
    }
    if (manifest.title !== campaign.name)
      errors.push('Manifest title must match campaign.json name.');
    if (manifest.missionCount !== campaign.missions.length) {
      errors.push('Manifest missionCount must match campaign.json.');
    }

    const scenarioById = new Map<string, string>();
    const scenarioPaths = paths.filter(
      (path) => path.startsWith(`${campaignFolder}missions/`) && path.endsWith('/scenario.json'),
    );
    const legacyScenarioPaths = paths.filter((path) =>
      /^Scenarios\/[^/]+\/scenario\.json$/.test(path),
    );
    for (const path of [...scenarioPaths, ...legacyScenarioPaths]) {
      const scenario = parseJson(path, files[path]!, gameScenarioFileSchema);
      const folderId = path.split('/').at(-2)!;
      if (scenario.id !== folderId) errors.push(`${path} id must match its containing folder.`);
      if (scenarioById.has(scenario.id)) {
        errors.push(`Duplicate/conflicting embedded scenario id: ${scenario.id}.`);
        continue;
      }
      scenarioById.set(scenario.id, path);
      errors.push(...validateGameScenarioSemantics(scenario).map((error) => `${path}: ${error}`));
      const base = path.slice(0, -'scenario.json'.length);
      const art = paths.filter((candidate) => {
        if (!candidate.startsWith(base)) return false;
        return SCENARIO_IMAGE_NAMES.has(candidate.slice(base.length).toLowerCase());
      });
      if (art.length !== 1) {
        errors.push(`${path} must have exactly one scenario map image.`);
      } else {
        const imageError = validateImage(art[0]!, files[art[0]!]!);
        if (imageError) errors.push(imageError);
      }
    }

    const orderedMissionIds = campaign.missions.map((mission) => mission.scenarioId);
    for (const mission of campaign.missions) {
      if (!scenarioById.has(mission.scenarioId)) {
        errors.push(`Missing embedded scenario: ${mission.scenarioId}.`);
      }
      if (mission.dialogue && typeof mission.dialogue === 'object') {
        const parsed = dialogueSchema.safeParse(mission.dialogue);
        if (!parsed.success || parsed.data.missionId !== mission.scenarioId) {
          errors.push(
            `Inline dialogue for ${mission.scenarioId} is invalid or has the wrong missionId.`,
          );
        }
      }
      const dialoguePath = `${campaignFolder}dialogues/${mission.scenarioId}.json`;
      if (files[dialoguePath]) {
        const dialogue = parseJson(dialoguePath, files[dialoguePath], dialogueSchema);
        if (dialogue.missionId !== mission.scenarioId) {
          errors.push(`${dialoguePath} missionId must match ${mission.scenarioId}.`);
        }
      }
    }

    const mediaManifestPath = `${campaignFolder}media/manifest.json`;
    const mediaManifestBytes = files[mediaManifestPath];
    const referencedMedia = new Set<string>();
    if (mediaManifestBytes) {
      const mediaManifest = parseJson(mediaManifestPath, mediaManifestBytes, mediaManifestSchema);
      const roles = new Set<string>();
      for (const asset of mediaManifest.assets) {
        if (roles.has(asset.role)) errors.push(`Duplicate media role: ${asset.role}.`);
        roles.add(asset.role);
        const mediaPath = `${campaignFolder}media/${asset.fileName}`;
        const bytes = files[mediaPath];
        if (!bytes) {
          errors.push(`Campaign media file is missing: ${mediaPath}.`);
          continue;
        }
        referencedMedia.add(mediaPath);
        const imageError = validateImage(mediaPath, bytes, asset.mimeType);
        if (imageError) errors.push(imageError);
      }
    }
    for (const path of paths.filter(
      (candidate) =>
        candidate.startsWith(`${campaignFolder}media/`) &&
        ALLOWED_IMAGE_EXTENSIONS.has(extension(candidate)),
    )) {
      if (!referencedMedia.has(path)) errors.push(`Unreferenced campaign media image: ${path}.`);
    }

    if (!(SUPPORTED_GAME_VERSIONS as readonly string[]).includes(manifest.gameVersion)) {
      errors.push(`Unsupported game version: ${manifest.gameVersion}.`);
    }
    return errors.length > 0
      ? { ok: false, errors }
      : { ok: true, contents: { manifest, campaign, thumbnail, orderedMissionIds } };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : 'Invalid package.'] };
  }
}
