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
