import { z } from 'zod';
import { DIFFICULTIES } from '../constants.ts';

export const manifestSchema = z.object({
  schemaVersion: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  author: z.string().trim().min(1).max(80),
  gameVersion: z.string().trim().min(1).max(32),
  scenarioFormatVersion: z.string().trim().min(1).max(32),
  difficulty: z.enum(DIFFICULTIES),
  recommendedTonnage: z.number().int().positive().max(100_000),
  maximumTonnage: z.number().int().positive().max(100_000),
  estimatedPlayTimeMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

export type Manifest = z.infer<typeof manifestSchema>;
