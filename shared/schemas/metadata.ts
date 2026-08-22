import { z } from 'zod';
import { DIFFICULTIES, PUBLICATION_STATUSES } from '../constants.ts';

export const mapDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const compatibilitySchema = z.object({
  gameVersionSupported: z.boolean(),
  scenarioFormatSupported: z.boolean(),
  warnings: z.array(z.string()),
});

export const scenarioMetadataSchema = z.object({
  metadataSchemaVersion: z.string().min(1),
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  authorDisplayName: z.string(),
  gameVersion: z.string(),
  scenarioFormatVersion: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  recommendedTonnage: z.number().int(),
  maximumTonnage: z.number().int(),
  estimatedPlayTimeMinutes: z.number().int(),
  tags: z.array(z.string()),
  mapDimensions: mapDimensionsSchema,
  averageRating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  downloadCount: z.number().int().nonnegative(),
  packageFileSize: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publicationStatus: z.enum(PUBLICATION_STATUSES),
  revision: z.number().int().positive().optional(),
  publishedRevision: z.number().int().positive().optional(),
  pendingRevision: z.number().int().positive().optional(),
  releaseId: z.string().min(1).optional(),
  availableRevisions: z.array(z.number().int().positive()).optional(),
  compatibility: compatibilitySchema,
});

export type ScenarioMetadata = z.infer<typeof scenarioMetadataSchema>;

export const ratingEntrySchema = z.object({
  clientId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  updatedAt: z.string().datetime(),
});

export const scenarioRatingsSchema = z.object({
  ratings: z.array(ratingEntrySchema),
});

export type RatingEntry = z.infer<typeof ratingEntrySchema>;
export type ScenarioRatings = z.infer<typeof scenarioRatingsSchema>;

export const creatorOwnershipSchema = z.object({
  schemaVersion: z.literal(1),
  contentType: z.enum(['scenario', 'campaign']),
  contentId: z.string().uuid(),
  ownerSub: z.string().min(1),
  ownerEmail: z.string().email(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreatorOwnership = z.infer<typeof creatorOwnershipSchema>;

export const scenarioSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  metadata: scenarioMetadataSchema,
  submittedAt: z.string().datetime(),
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

export type ScenarioSubmission = z.infer<typeof scenarioSubmissionSchema>;

export const scenarioReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1),
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  metadata: scenarioMetadataSchema,
  approvedAt: z.string().datetime(),
  approvedBySub: z.string().min(1),
});

export type ScenarioRelease = z.infer<typeof scenarioReleaseSchema>;

export const administrativeDeletionSchema = z.object({
  schemaVersion: z.literal(1),
  contentType: z.enum(['scenario', 'campaign']),
  contentId: z.string().uuid(),
  deletedAt: z.string().datetime(),
  deletedBySub: z.string().min(1),
  retainedImmutableRevisions: z.literal(true),
});

export type AdministrativeDeletion = z.infer<typeof administrativeDeletionSchema>;
