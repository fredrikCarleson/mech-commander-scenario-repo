import { describe, expect, it } from 'vitest';
import { manifestSchema } from '../shared/schemas/manifest.ts';
import { mapFileSchema } from '../shared/schemas/map.ts';
import { scenarioFileSchema } from '../shared/schemas/scenario-file.ts';
import { scenarioMetadataSchema } from '../shared/schemas/metadata.ts';
import { submitRatingBodySchema } from '../shared/schemas/api.ts';

describe('schema validation', () => {
  it('accepts a valid manifest', () => {
    const result = manifestSchema.safeParse({
      schemaVersion: '1.0.0',
      title: 'Test',
      description: 'A valid scenario package for testing.',
      author: 'Tester',
      gameVersion: '1.0.0',
      scenarioFormatVersion: '1.0.0',
      difficulty: 'regular',
      recommendedTonnage: 3000,
      maximumTonnage: 4000,
      estimatedPlayTimeMinutes: 30,
      tags: ['test'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects manifest with empty title', () => {
    const result = manifestSchema.safeParse({
      schemaVersion: '1.0.0',
      title: '',
      description: 'Invalid',
      author: 'Tester',
      gameVersion: '1.0.0',
      scenarioFormatVersion: '1.0.0',
      difficulty: 'regular',
      recommendedTonnage: 3000,
      maximumTonnage: 4000,
      estimatedPlayTimeMinutes: 30,
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts map and scenario file schemas', () => {
    expect(mapFileSchema.safeParse({ schemaVersion: '1.0.0', width: 16, height: 16 }).success).toBe(
      true,
    );
    expect(scenarioFileSchema.safeParse({ schemaVersion: '1.0.0', name: 'Probe' }).success).toBe(
      true,
    );
  });

  it('accepts stored metadata shape', () => {
    const result = scenarioMetadataSchema.safeParse({
      metadataSchemaVersion: '1.0.0',
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test',
      description: 'Desc',
      authorDisplayName: 'Author',
      gameVersion: '1.0.0',
      scenarioFormatVersion: '1.0.0',
      difficulty: 'regular',
      recommendedTonnage: 1000,
      maximumTonnage: 2000,
      estimatedPlayTimeMinutes: 20,
      tags: ['a'],
      mapDimensions: { width: 8, height: 8 },
      averageRating: 0,
      ratingCount: 0,
      downloadCount: 0,
      packageFileSize: 100,
      checksumSha256: 'a'.repeat(64),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publicationStatus: 'published',
      compatibility: {
        gameVersionSupported: true,
        scenarioFormatSupported: true,
        warnings: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates rating payload', () => {
    const result = submitRatingBodySchema.safeParse({
      rating: 4,
      clientId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });
});
