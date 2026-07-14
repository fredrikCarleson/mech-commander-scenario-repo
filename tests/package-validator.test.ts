import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildScenarioZip } from '../fixtures/build-fixtures.ts';
import { validateScenarioPackage } from '../shared/validation/package-validator.ts';

describe('package validator', () => {
  it('accepts a valid scenario package', async () => {
    const zipBytes = await buildScenarioZip();
    const result = await validateScenarioPackage(zipBytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contents.manifest.title).toBe('Urban Night Raid');
    }
  });

  it('rejects missing manifest', async () => {
    const zipBytes = await buildScenarioZip({ omit: ['manifest.json'] });
    const result = await validateScenarioPackage(zipBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('manifest.json'))).toBe(true);
    }
  });

  it('rejects unsupported manifest schema version', async () => {
    const zipBytes = await buildScenarioZip({
      manifest: {
        schemaVersion: '9.9.9',
        title: 'Bad',
        description: 'Unsupported schema version test package.',
        author: 'Tester',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'regular',
        recommendedTonnage: 1000,
        maximumTonnage: 2000,
        estimatedPlayTimeMinutes: 20,
        tags: [],
      },
    });
    const result = await validateScenarioPackage(zipBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/Unsupported manifest schema version/);
    }
  });

  it('rejects oversized compressed packages', async () => {
    const zipBytes = await buildScenarioZip();
    const result = await validateScenarioPackage(zipBytes, { maxCompressedBytes: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/Compressed package exceeds/);
    }
  });

  it('rejects zip path traversal entries', async () => {
    const zip = await JSZip.loadAsync(await buildScenarioZip());
    zip.file('../../outside/manifest.json', '{}');
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await validateScenarioPackage(zipBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((error) =>
          /Unsafe ZIP path|Only root-level files|Directories are not allowed/.test(error),
        ),
      ).toBe(true);
    }
  });

  it('rejects invalid metadata', async () => {
    const zipBytes = await buildScenarioZip({
      manifest: {
        schemaVersion: '1.0.0',
        title: '',
        description: 'Missing title should fail validation.',
        author: 'Tester',
        gameVersion: '1.0.0',
        scenarioFormatVersion: '1.0.0',
        difficulty: 'regular',
        recommendedTonnage: 1000,
        maximumTonnage: 2000,
        estimatedPlayTimeMinutes: 20,
        tags: [],
      },
    });
    const result = await validateScenarioPackage(zipBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/manifest.json failed validation/);
    }
  });
});
