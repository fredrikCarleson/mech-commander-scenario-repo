import { z } from 'zod';

export const minimalScenarioFileSchema = z.object({
  schemaVersion: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

export const gameScenarioFileSchema = z
  .object({
    version: z.literal(1),
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(4000),
    environment: z.string().trim().min(1).max(120),
    biome: z.enum(['temperate', 'lunar', 'desert']),
    massLimit: z.number().int().positive(),
    objective: z
      .object({
        kind: z.string().min(1),
        description: z.string().trim().min(1).max(4000),
      })
      .passthrough(),
    playerDeployZone: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
    enemyForce: z
      .array(
        z
          .object({
            chassisId: z.string().min(1),
            skill: z.number(),
            pos: z.object({ x: z.number(), y: z.number() }),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export const scenarioFileSchema = z.union([gameScenarioFileSchema, minimalScenarioFileSchema]);

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;

export function isGameScenarioFile(
  scenario: ScenarioFile,
): scenario is z.infer<typeof gameScenarioFileSchema> {
  return 'version' in scenario && scenario.version === 1;
}
