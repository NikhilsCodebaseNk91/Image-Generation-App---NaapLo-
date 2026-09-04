import type { ImageGenerationProvider } from './types.ts';
import { GeminiImageProvider } from './geminiProvider.ts';

let defaultProvider: ImageGenerationProvider | null = null;

export function getImageProvider(): ImageGenerationProvider {
  const providerName = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase();

  if (providerName === 'gemini') {
    if (!defaultProvider || defaultProvider.name !== 'gemini') {
      defaultProvider = new GeminiImageProvider();
    }
    return defaultProvider;
  }

  // Future phases can register OpenRouter, OpenAI, etc. without touching UI or router logic.
  console.warn(
    `[imageProvider] Unknown provider "${providerName}", defaulting to Gemini provider.`
  );
  return new GeminiImageProvider();
}

export * from './types.ts';
export * from './geminiProvider.ts';
