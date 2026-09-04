import fs from 'fs/promises';
import path from 'path';

let cachedMasterPrompt: string | null = null;

/**
 * Loads the authoritative Fashion Suit Image Generation Master Prompt.
 * In Phase 1, this reads directly from the local file (config/master-prompt.md).
 * In Phase 2, this function can be enhanced to query Google Drive with this local file as fallback,
 * while other application components remain completely agnostic of the prompt source.
 */
export async function loadMasterPrompt(): Promise<string> {
  // If already in memory in production, we can reuse it, or reload to support hot edits in dev
  if (cachedMasterPrompt && process.env.NODE_ENV === 'production') {
    return cachedMasterPrompt;
  }

  const promptPath = path.resolve(process.cwd(), 'config', 'master-prompt.md');
  try {
    const content = await fs.readFile(promptPath, 'utf-8');
    cachedMasterPrompt = content.trim();
    return cachedMasterPrompt;
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[masterPrompt] Failed to load prompt from ${promptPath}:`, error.message);
    throw new Error(`Master prompt file could not be loaded: ${error.message}`);
  }
}
