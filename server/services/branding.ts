import sharp from 'sharp';
import type { OutputType } from '../../shared/outputTypes.ts';
import type { SystemAsset } from './systemAssets.ts';

export const BRANDED_OUTPUT_TYPES: readonly OutputType[] = [
  'SPECIAL POSE',
  'DESCRIPTIVE CATALOGUE POSTER',
  'MULTIPLE OUTFIT VIEW',
];

export interface BrandedImage {
  mimeType: 'image/png';
  base64: string;
  brandingApplied: true;
  brandingSourceIdentity: string;
  brandingPosition: 'TOP_RIGHT';
}

export function requiresNaapLoBranding(outputType: OutputType): boolean {
  return BRANDED_OUTPUT_TYPES.includes(outputType);
}

export async function normalizeGeneratedImageToPng(generatedBase64: string): Promise<{ mimeType: 'image/png'; base64: string }> {
  const png = await sharp(Buffer.from(generatedBase64, 'base64')).autoOrient().png().toBuffer();
  return { mimeType: 'image/png', base64: png.toString('base64') };
}

/**
 * Composites the approved logo file as pixels after AI generation. The provider
 * is never asked to redraw the logo, so the supplied asset remains authoritative.
 */
export async function applyNaapLoBranding(
  generatedBase64: string,
  logo: SystemAsset,
): Promise<BrandedImage> {
  const generated = Buffer.from(generatedBase64, 'base64');
  const orientedGenerated = await sharp(generated).autoOrient().toBuffer();
  const metadata = await sharp(orientedGenerated).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Generated image dimensions could not be read for branding.');

  const logoWidth = Math.max(112, Math.min(280, Math.round(metadata.width * 0.18)));
  const margin = Math.max(16, Math.round(Math.min(metadata.width, metadata.height) * 0.025));
  const logoTile = await sharp(Buffer.from(logo.base64, 'base64'))
    .resize({ width: logoWidth, withoutEnlargement: true })
    .png()
    .toBuffer();
  const logoMetadata = await sharp(logoTile).metadata();
  if (!logoMetadata.width || !logoMetadata.height) throw new Error('Approved logo dimensions could not be read.');

  const composed = await sharp(orientedGenerated)
    .composite([{
      input: logoTile,
      left: Math.max(0, metadata.width - logoMetadata.width - margin),
      top: margin,
      blend: 'over',
    }])
    .png()
    .toBuffer();

  return {
    mimeType: 'image/png',
    base64: composed.toString('base64'),
    brandingApplied: true,
    brandingSourceIdentity: logo.sourceIdentity || logo.name,
    brandingPosition: 'TOP_RIGHT',
  };
}
