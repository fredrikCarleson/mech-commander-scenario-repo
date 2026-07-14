import JSZip from 'jszip';
import manifest from './valid-package/manifest.json';
import map from './valid-package/map.json';
import scenario from './valid-package/scenario.json';

/** Minimal valid lossy WebP (1x1) */
export const MINIMAL_WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
  0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd, 0x50, 0x00,
]);

export interface BuildPackageOptions {
  manifest?: Record<string, unknown>;
  map?: Record<string, unknown>;
  scenario?: Record<string, unknown>;
  extraFiles?: Record<string, Uint8Array | string>;
  omit?: string[];
}

export async function buildScenarioZip(options: BuildPackageOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  const manifestData = options.manifest ?? manifest;
  const mapData = options.map ?? map;
  const scenarioData = options.scenario ?? scenario;
  const omitted = new Set(options.omit ?? []);

  if (!omitted.has('manifest.json')) {
    zip.file('manifest.json', JSON.stringify(manifestData, null, 2));
  }
  if (!omitted.has('scenario.json')) {
    zip.file('scenario.json', JSON.stringify(scenarioData, null, 2));
  }
  if (!omitted.has('map.json')) {
    zip.file('map.json', JSON.stringify(mapData, null, 2));
  }
  if (!omitted.has('thumbnail.webp')) {
    zip.file('thumbnail.webp', MINIMAL_WEBP);
  }

  for (const [name, content] of Object.entries(options.extraFiles ?? {})) {
    zip.file(name, content);
  }

  const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return buffer;
}
