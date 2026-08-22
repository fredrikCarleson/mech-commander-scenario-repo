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
        kind: z.enum(['destroyAll', 'holdHex', 'surviveRounds', 'assassinate', 'extract']),
        description: z.string().trim().min(1).max(4000),
      })
      .passthrough(),
    grid: z.object({
      width: z.number().int().min(6).max(64),
      height: z.number().int().min(6).max(64),
      rows: z.array(z.string().min(1)).min(6).max(64),
      overrides: z
        .record(
          z.string(),
          z.object({
            v: z.number().int().optional(),
            r: z.number().int().min(0).max(5).optional(),
          }),
        )
        .optional(),
    }),
    playerDeployZone: z
      .array(z.object({ x: z.number().int(), y: z.number().int() }))
      .min(1)
      .max(64),
    escapeZone: z
      .array(z.object({ x: z.number().int(), y: z.number().int() }))
      .max(64)
      .optional(),
    enemyForce: z
      .array(
        z
          .object({
            chassisId: z.string().min(1),
            skill: z.number().int().min(0).max(10),
            pos: z.object({ x: z.number().int(), y: z.number().int() }),
          })
          .passthrough(),
      )
      .min(1)
      .max(64),
  })
  .passthrough();

export const scenarioFileSchema = z.union([gameScenarioFileSchema, minimalScenarioFileSchema]);

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;

export function isGameScenarioFile(
  scenario: ScenarioFile,
): scenario is z.infer<typeof gameScenarioFileSchema> {
  return 'version' in scenario && scenario.version === 1;
}

export function validateGameScenarioSemantics(
  scenario: z.infer<typeof gameScenarioFileSchema>,
): string[] {
  const errors: string[] = [];
  const { width, height, rows } = scenario.grid;
  if (rows.length !== height) errors.push('grid.rows length must match grid.height.');
  if (rows.some((row) => row.length !== width)) {
    errors.push('Every grid row length must match grid.width.');
  }
  if (rows.some((row) => !/^[.frcwdlbxh=]+$/.test(row))) {
    errors.push('grid.rows contains an unsupported terrain character.');
  }
  const positions = [
    ...scenario.playerDeployZone,
    ...(scenario.escapeZone ?? []),
    ...scenario.enemyForce.map((enemy) => enemy.pos),
  ];
  if (positions.some(({ x, y }) => x < 0 || y < 0 || x >= width || y >= height)) {
    errors.push('A deployment, escape, or enemy position is outside the scenario grid.');
  }
  return errors;
}
