import { z } from 'zod';

export const scenarioFileSchema = z.object({
  schemaVersion: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;
