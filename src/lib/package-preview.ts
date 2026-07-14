import { validateScenarioPackage } from '../../shared/validation/package-validator.ts';
import type { ValidatedPackageContents } from '../../shared/validation/package-validator.ts';

export interface PackagePreview {
  ok: true;
  contents: ValidatedPackageContents;
  fileName: string;
  fileSize: number;
  thumbnailUrl: string;
}

export interface PackagePreviewError {
  ok: false;
  errors: string[];
  fileName: string;
}

export type PackagePreviewResult = PackagePreview | PackagePreviewError;

export async function previewScenarioPackage(file: File): Promise<PackagePreviewResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = await validateScenarioPackage(bytes);

  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      fileName: file.name,
    };
  }

  const thumbnailBlob = new Blob([validation.contents.thumbnail.slice()], {
    type: 'image/webp',
  });

  return {
    ok: true,
    contents: validation.contents,
    fileName: file.name,
    fileSize: file.size,
    thumbnailUrl: URL.createObjectURL(thumbnailBlob),
  };
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
