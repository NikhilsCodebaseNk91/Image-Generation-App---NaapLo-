import fs from 'fs/promises';
import path from 'path';

export interface SystemAsset {
  name: string;
  mimeType: string;
  base64: string;
}

let cachedLogo: SystemAsset | null = null;
let cachedMultipleOutfitRef: SystemAsset | null = null;

export async function getNaapLoLogoAsset(): Promise<SystemAsset | null> {
  if (cachedLogo) return cachedLogo;

  const logoPath = path.resolve(process.cwd(), 'config', 'system-assets', 'NaapLo Logo.png');
  try {
    const buffer = await fs.readFile(logoPath);
    cachedLogo = {
      name: 'NaapLo Logo.png',
      mimeType: 'image/png',
      base64: buffer.toString('base64'),
    };
    return cachedLogo;
  } catch (err: unknown) {
    console.warn('[systemAssets] Warning: NaapLo Logo.png not found or could not be read:', (err as Error).message);
    return null;
  }
}

export async function getMultipleOutfitRefAsset(): Promise<SystemAsset | null> {
  if (cachedMultipleOutfitRef) return cachedMultipleOutfitRef;

  const refPath = path.resolve(
    process.cwd(),
    'config',
    'system-assets',
    'Reference Image for MULTIPLE OUTFIT VIEW.png'
  );
  try {
    const buffer = await fs.readFile(refPath);
    cachedMultipleOutfitRef = {
      name: 'Reference Image for MULTIPLE OUTFIT VIEW.png',
      mimeType: 'image/png',
      base64: buffer.toString('base64'),
    };
    return cachedMultipleOutfitRef;
  } catch (err: unknown) {
    console.warn(
      '[systemAssets] Warning: Reference Image for MULTIPLE OUTFIT VIEW.png not found or could not be read:',
      (err as Error).message
    );
    return null;
  }
}
