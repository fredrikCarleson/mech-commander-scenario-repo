import { z } from 'zod';
import { DIFFICULTIES, PUBLICATION_STATUSES } from '../constants.ts';

export const campaignManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  stableCampaignId: z.string().regex(/^(custom|user)-[a-z0-9-]{1,57}$/),
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(400),
  author: z.string().trim().min(1).max(80),
  gameVersion: z.string().trim().min(1).max(32),
  campaignFormatVersion: z.literal('2.0.0'),
  difficulty: z.enum(DIFFICULTIES),
  missionCount: z.number().int().min(1).max(12),
  estimatedPlayTimeMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

export type CampaignManifest = z.infer<typeof campaignManifestSchema>;

export const portableCampaignSchema = z
  .object({
    version: z.literal(2),
    id: z.string().regex(/^(custom|user)-[a-z0-9-]{1,57}$/),
    name: z.string().trim().min(1).max(80),
    tagline: z.string().trim().min(1).max(200),
    author: z.object({ displayName: z.string().trim().min(1).max(80) }),
    designTargets: z.object({
      difficulty: z.enum(DIFFICULTIES),
      experience: z.string().max(400).optional(),
    }),
    defaultCompanyName: z.string().trim().min(1).max(80),
    startingFunds: z.number().nonnegative(),
    startingReputation: z.number(),
    startingMachines: z.array(z.string().min(1)).min(1),
    missions: z
      .array(
        z
          .object({
            scenarioId: z.string().min(1),
            opCode: z.string().trim().min(1),
          })
          .passthrough(),
      )
      .min(1)
      .max(12),
    intro: z.object({ slides: z.array(z.unknown()).min(1).max(12) }).passthrough(),
  })
  .passthrough();

export type PortableCampaign = z.infer<typeof portableCampaignSchema>;

export const campaignMetadataSchema = z.object({
  metadataSchemaVersion: z.string().min(1),
  id: z.string().uuid(),
  stableCampaignId: z.string(),
  title: z.string(),
  tagline: z.string(),
  authorDisplayName: z.string(),
  gameVersion: z.string(),
  campaignFormatVersion: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  missionCount: z.number().int().positive(),
  estimatedPlayTimeMinutes: z.number().int().positive(),
  tags: z.array(z.string()),
  averageRating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  downloadCount: z.number().int().nonnegative(),
  packageFileSize: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publicationStatus: z.enum(PUBLICATION_STATUSES),
  revision: z.number().int().positive(),
  publishedRevision: z.number().int().positive().optional(),
  pendingRevision: z.number().int().positive().optional(),
  releaseId: z.string().min(1).optional(),
  availableRevisions: z.array(z.number().int().positive()).optional(),
  compatibility: z.object({
    gameVersionSupported: z.boolean(),
    campaignFormatSupported: z.boolean(),
    warnings: z.array(z.string()),
  }),
});

export type CampaignMetadata = z.infer<typeof campaignMetadataSchema>;

export const campaignSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  metadata: campaignMetadataSchema,
  submittedAt: z.string().datetime(),
  orderedMissionIds: z.array(z.string().min(1)).min(1).max(12),
  activation: z
    .object({
      command: z.literal('approve'),
      revision: z.number().int().positive(),
      moderatorSub: z.string().min(1),
      startedAt: z.string().datetime(),
    })
    .optional(),
  rejection: z
    .object({
      reason: z.string().trim().min(1).max(1000),
      moderatorSub: z.string().min(1),
      moderatedAt: z.string().datetime(),
    })
    .optional(),
});

export type CampaignSubmission = z.infer<typeof campaignSubmissionSchema>;

export const campaignReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1),
  id: z.string().uuid(),
  stableCampaignId: z.string(),
  revision: z.number().int().positive(),
  orderedMissionIds: z.array(z.string().min(1)).min(1).max(12),
  metadata: campaignMetadataSchema,
  approvedAt: z.string().datetime(),
  approvedBySub: z.string().min(1),
});

export type CampaignRelease = z.infer<typeof campaignReleaseSchema>;

export const stableCampaignClaimSchema = z.object({
  schemaVersion: z.literal(1),
  stableCampaignId: z.string(),
  repositoryId: z.string().uuid(),
  ownerSub: z.string().min(1),
  initialChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  claimedAt: z.string().datetime(),
  state: z.enum(['active', 'withdrawn', 'deleted']),
});

export type StableCampaignClaim = z.infer<typeof stableCampaignClaimSchema>;
