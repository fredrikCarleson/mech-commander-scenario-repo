import { SUPPORTED_GAME_VERSIONS, SUPPORTED_SCENARIO_FORMAT_VERSIONS } from './constants.ts';

export interface CompatibilityResult {
  gameVersionSupported: boolean;
  scenarioFormatSupported: boolean;
  warnings: string[];
}

export function detectCompatibility(
  gameVersion: string,
  scenarioFormatVersion: string,
): CompatibilityResult {
  const gameVersionSupported = (SUPPORTED_GAME_VERSIONS as readonly string[]).includes(gameVersion);
  const scenarioFormatSupported = (
    SUPPORTED_SCENARIO_FORMAT_VERSIONS as readonly string[]
  ).includes(scenarioFormatVersion);

  const warnings: string[] = [];
  if (!gameVersionSupported) {
    warnings.push(
      `Game version ${gameVersion} is not in the supported list (${SUPPORTED_GAME_VERSIONS.join(', ')}).`,
    );
  }
  if (!scenarioFormatSupported) {
    warnings.push(
      `Scenario format ${scenarioFormatVersion} is not in the supported list (${SUPPORTED_SCENARIO_FORMAT_VERSIONS.join(', ')}).`,
    );
  }

  return { gameVersionSupported, scenarioFormatSupported, warnings };
}

export function isFullyCompatible(result: CompatibilityResult): boolean {
  return result.gameVersionSupported && result.scenarioFormatSupported;
}
