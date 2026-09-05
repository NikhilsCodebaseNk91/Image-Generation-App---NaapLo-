import fs from 'fs/promises';
import path from 'path';
import { DRIVE_SOURCE_IDS, fetchDriveFile, isDriveEnabled } from './driveSource.ts';

export interface MasterPromptDocument {
  source: 'LOCAL' | 'GOOGLE_DRIVE';
  content: string;
  version?: string;
  lastUpdated?: string;
  sourceIdentity?: string;
}

let cachedMasterPrompt: MasterPromptDocument | null = null;

function extractPromptMetadata(content: string) {
  const version = content.match(/PROMPT VERSION:\s*([0-9.]+)/i)?.[1];
  const approved = /STATUS:\s*APPROVED/i.test(content);
  return { version, approved };
}

async function loadLocalPrompt(): Promise<MasterPromptDocument> {
  const promptPath = path.resolve(process.cwd(), 'config', 'master-prompt.md');
  const content = (await fs.readFile(promptPath, 'utf-8')).trim();
  const metadata = extractPromptMetadata(content);
  return { source: 'LOCAL', content, version: metadata.version, sourceIdentity: 'config/master-prompt.md' };
}

/**
 * Loads the authoritative Fashion Suit Image Generation Master Prompt.
 * CP-005 prefers the approved Google Drive source when enabled and authenticated,
 * with config/master-prompt.md as a controlled local fallback.
 */
export async function loadMasterPrompt(): Promise<MasterPromptDocument> {
  // If already in memory in production, we can reuse it, or reload to support hot edits in dev
  if (cachedMasterPrompt && process.env.NODE_ENV === 'production') {
    return cachedMasterPrompt;
  }

  if (isDriveEnabled()) {
    try {
      const fileId = process.env.DRIVE_MASTER_PROMPT_FILE_ID || DRIVE_SOURCE_IDS.masterPrompt;
      const remote = await fetchDriveFile(fileId, ['text/markdown', 'text/plain'], 1_000_000);
      const content = remote.data.toString('utf8').replace(/^\uFEFF/, '').trim();
      const metadata = extractPromptMetadata(content);
      const minimumVersion = process.env.DRIVE_MASTER_PROMPT_MIN_VERSION || '1.5.5';
      if (!metadata.approved) throw new Error('Drive master prompt is not marked APPROVED.');
      if (!metadata.version || metadata.version.localeCompare(minimumVersion, undefined, { numeric: true }) < 0) {
        throw new Error(`Drive master prompt version ${metadata.version || 'unknown'} is older than required ${minimumVersion}.`);
      }
      cachedMasterPrompt = { source: 'GOOGLE_DRIVE', content, version: metadata.version, lastUpdated: remote.modifiedTime, sourceIdentity: `google-drive:${fileId}` };
      return cachedMasterPrompt;
    } catch (error) {
      console.warn('[masterPrompt] Drive source unavailable or invalid; using controlled local fallback:', (error as Error).message);
    }
  }

  try {
    cachedMasterPrompt = await loadLocalPrompt();
    return cachedMasterPrompt;
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[masterPrompt] Failed to load local fallback:', error.message);
    throw new Error(`Master prompt file could not be loaded: ${error.message}`);
  }
}

export function resetMasterPromptCacheForTests() {
  cachedMasterPrompt = null;
}
