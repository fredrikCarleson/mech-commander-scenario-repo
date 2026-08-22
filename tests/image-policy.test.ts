import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES,
  COMMUNITY_MAX_IMAGE_DIMENSION,
} from '../shared/constants.ts';
import { inspectCommunityImage } from '../shared/validation/image-validation.ts';
import { validateScenarioPackage } from '../shared/validation/package-validator.ts';
import { buildScenarioZip, MINIMAL_WEBP } from '../fixtures/build-fixtures.ts';

function png(width: number, height: number, size = 24): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe('community image policy', () => {
  it('accepts exact byte and dimension boundaries and rejects one beyond', () => {
    expect(
      inspectCommunityImage(
        png(COMMUNITY_MAX_IMAGE_DIMENSION, COMMUNITY_MAX_IMAGE_DIMENSION),
        'image/png',
      ),
    ).toMatchObject({
      width: COMMUNITY_MAX_IMAGE_DIMENSION,
      height: COMMUNITY_MAX_IMAGE_DIMENSION,
    });
    expect(() => inspectCommunityImage(png(COMMUNITY_MAX_IMAGE_DIMENSION + 1, 1))).toThrow(
      /dimensions/i,
    );
  });

  it('rejects image signature/MIME disagreement', () => {
    expect(() => inspectCommunityImage(png(1, 1), 'image/webp')).toThrow(/not declared/i);
    expect(() => inspectCommunityImage(new Uint8Array([1, 2, 3]), 'image/png')).toThrow(
      /signature/i,
    );
  });

  it('enforces the exact 1 MiB thumbnail boundary through package validation', async () => {
    const atLimitZip = await JSZip.loadAsync(await buildScenarioZip());
    const exactImage = new Uint8Array(COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES);
    exactImage.set(MINIMAL_WEBP);
    atLimitZip.file('thumbnail.webp', exactImage);
    const atLimit = await atLimitZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect((await validateScenarioPackage(atLimit)).ok).toBe(true);

    const overLimitZip = await JSZip.loadAsync(atLimit);
    const overLimit = new Uint8Array(COMMUNITY_MAX_CAMPAIGN_IMAGE_BYTES + 1);
    overLimit.set(await overLimitZip.file('thumbnail.webp')!.async('uint8array'));
    overLimitZip.file('thumbnail.webp', overLimit);
    const result = await validateScenarioPackage(
      await overLimitZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/image limit/i);
  });
});
