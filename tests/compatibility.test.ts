import { describe, expect, it } from 'vitest';
import { detectCompatibility, isFullyCompatible } from '../shared/compatibility.ts';

describe('compatibility detection', () => {
  it('marks supported versions as compatible', () => {
    const result = detectCompatibility('1.0.0', '1.0.0');
    expect(isFullyCompatible(result)).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on unsupported game version', () => {
    const result = detectCompatibility('9.0.0', '1.0.0');
    expect(result.gameVersionSupported).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/Game version 9.0.0/);
  });

  it('warns on unsupported scenario format version', () => {
    const result = detectCompatibility('1.0.0', '9.0.0');
    expect(result.scenarioFormatSupported).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/Scenario format 9.0.0/);
  });
});
