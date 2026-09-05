import fs from 'fs/promises';
import path from 'path';
import { DRIVE_SOURCE_IDS, fetchDriveFile, isDriveEnabled } from './driveSource.ts';

export interface SystemAsset {
  name: string;
  mimeType: string;
  base64: string;
  source?: 'LOCAL' | 'GOOGLE_DRIVE';
  sourceIdentity?: string;
  lastUpdated?: string;
}

let cachedLogo: SystemAsset | null = null;
let cachedMultipleOutfitRef: SystemAsset | null = null;

async function loadDriveAsset(fileId: string): Promise<SystemAsset> {
  const remote = await fetchDriveFile(fileId, ['image/png'], 5_000_000);
  return { name: remote.name, mimeType: remote.mimeType, base64: remote.data.toString('base64'), source: 'GOOGLE_DRIVE', sourceIdentity: `google-drive:${fileId}`, lastUpdated: remote.modifiedTime };
}

export async function getNaapLoLogoAsset(): Promise<SystemAsset | null> {
  if (cachedLogo) return cachedLogo;

  if (isDriveEnabled()) {
    try {
      cachedLogo = await loadDriveAsset(process.env.DRIVE_LOGO_FILE_ID || DRIVE_SOURCE_IDS.logo);
      return cachedLogo;
    } catch (error) {
      console.warn('[systemAssets] Drive logo unavailable; using controlled local fallback:', (error as Error).message);
    }
  }

  const logoPath = path.resolve(process.cwd(), 'config', 'system-assets', 'NaapLo Logo.png');
  try {
    const buffer = await fs.readFile(logoPath);
    cachedLogo = {
      name: 'NaapLo Logo.png',
      mimeType: 'image/png',
      base64: buffer.toString('base64'),
      source: 'LOCAL',
      sourceIdentity: 'config/system-assets/NaapLo Logo.png',
    };
    return cachedLogo;
  } catch (err: unknown) {
    console.warn('[systemAssets] Warning: NaapLo Logo.png not found or could not be read:', (err as Error).message);
    return null;
  }
}

export async function getMultipleOutfitRefAsset(): Promise<SystemAsset | null> {
  if (cachedMultipleOutfitRef) return cachedMultipleOutfitRef;

  if (isDriveEnabled()) {
    try {
      cachedMultipleOutfitRef = await loadDriveAsset(process.env.DRIVE_MULTIPLE_OUTFIT_FILE_ID || DRIVE_SOURCE_IDS.multipleOutfit);
      return cachedMultipleOutfitRef;
    } catch (error) {
      console.warn('[systemAssets] Drive multiple-outfit reference unavailable; using controlled local fallback:', (error as Error).message);
    }
  }

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
      source: 'LOCAL',
      sourceIdentity: 'config/system-assets/Reference Image for MULTIPLE OUTFIT VIEW.png',
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

export function resetSystemAssetCacheForTests() {
  cachedLogo = null;
  cachedMultipleOutfitRef = null;
}
