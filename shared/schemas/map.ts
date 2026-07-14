import { z } from 'zod';

export const mapFileSchema = z.object({
  schemaVersion: z.string().min(1),
  width: z.number().int().positive().max(512),
  height: z.number().int().positive().max(512),
});

export type MapFile = z.infer<typeof mapFileSchema>;
