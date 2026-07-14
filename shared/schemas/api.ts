import { z } from 'zod';
import { DIFFICULTIES, SORT_OPTIONS } from '../constants.ts';
import { scenarioMetadataSchema } from './metadata.ts';

export const scenarioListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
  search: z.string().trim().optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  maxTonnage: z.coerce.number().int().positive().optional(),
  tags: z.string().trim().optional(),
  sort: z.enum(SORT_OPTIONS).default('newest'),
});

export type ScenarioListQuery = z.infer<typeof scenarioListQuerySchema>;

export const scenarioListResponseSchema = z.object({
  items: z.array(scenarioMetadataSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type ScenarioListResponse = z.infer<typeof scenarioListResponseSchema>;

export const submitRatingBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  clientId: z.string().uuid(),
});

export type SubmitRatingBody = z.infer<typeof submitRatingBodySchema>;

export const submitRatingResponseSchema = z.object({
  averageRating: z.number(),
  ratingCount: z.number().int(),
  yourRating: z.number().int(),
});

export type SubmitRatingResponse = z.infer<typeof submitRatingResponseSchema>;

export const uploadResponseSchema = z.object({
  id: z.string().uuid(),
  metadata: scenarioMetadataSchema,
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
