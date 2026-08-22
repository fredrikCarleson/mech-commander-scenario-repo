import { COMMUNITY_MAX_IMAGE_DIMENSION } from '../constants.ts';

export const COMMUNITY_IMAGE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
} as const;

export type CommunityImageMime =
  (typeof COMMUNITY_IMAGE_MIME_BY_EXTENSION)[keyof typeof COMMUNITY_IMAGE_MIME_BY_EXTENSION];

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return {
        height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
      };
    }
    offset += length;
  }
  return null;
}

export function inspectCommunityImage(
  bytes: Uint8Array,
  expectedMime?: string,
): { mimeType: CommunityImageMime; width: number; height: number } {
  let result: { mimeType: CommunityImageMime; width: number; height: number } | null = null;
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    result = {
      mimeType: 'image/png',
      width: readUint32Be(bytes, 16),
      height: readUint32Be(bytes, 20),
    };
  } else {
    const jpeg = jpegDimensions(bytes);
    if (jpeg) result = { mimeType: 'image/jpeg', ...jpeg };
  }
  if (
    !result &&
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') {
      result = {
        mimeType: 'image/webp',
        width: readUint24Le(bytes, 24) + 1,
        height: readUint24Le(bytes, 27) + 1,
      };
    } else if (
      chunk === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      result = {
        mimeType: 'image/webp',
        width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
        height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
      };
    }
  }
  if (!result || result.width < 1 || result.height < 1) {
    throw new Error('Image signature or dimensions are invalid.');
  }
  if (
    result.width > COMMUNITY_MAX_IMAGE_DIMENSION ||
    result.height > COMMUNITY_MAX_IMAGE_DIMENSION
  ) {
    throw new Error(
      `Image dimensions exceed ${COMMUNITY_MAX_IMAGE_DIMENSION}x${COMMUNITY_MAX_IMAGE_DIMENSION}.`,
    );
  }
  if (expectedMime && result.mimeType !== expectedMime) {
    throw new Error(`Image bytes are ${result.mimeType}, not declared ${expectedMime}.`);
  }
  return result;
}
