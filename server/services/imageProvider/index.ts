import type { ImageGenerationProvider } from './types.ts';
import { GeminiImageProvider } from './geminiProvider.ts';
import { OpenAIImageProvider } from './openaiProvider.ts';

let defaultProvider: ImageGenerationProvider | null = null;

export interface ImageProviderConfiguration {
  provider: 'gemini' | 'openai' | string;
  model: string;
  hasApiKey: boolean;
}

export function getImageProviderConfiguration(): ImageProviderConfiguration {
  const provider = (process.env.IMAGE_PROVIDER || 'openai').trim().toLowerCase();
  if (provider === 'openai') {
    return {
      provider,
      model: process.env.IMAGE_MODEL?.trim() || 'gpt-image-2',
      hasApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    };
  }
  if (provider === 'gemini') {
    return {
      provider,
      model: process.env.IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    };
  }
  return {
    provider,
    model: process.env.IMAGE_MODEL?.trim() || 'unconfigured',
    hasApiKey: false,
  };
}

export function getImageProvider(): ImageGenerationProvider {
  const providerName = getImageProviderConfiguration().provider;

  if (providerName === 'openai') {
    if (!defaultProvider || defaultProvider.name !== 'openai') {
      defaultProvider = new OpenAIImageProvider();
    }
    return defaultProvider;
  }

  if (providerName === 'gemini') {
    if (!defaultProvider || defaultProvider.name !== 'gemini') {
      defaultProvider = new GeminiImageProvider();
    }
    return defaultProvider;
  }

  throw new Error(
    `Unsupported IMAGE_PROVIDER "${providerName}". Supported providers: openai, gemini.`
  );
}

export * from './types.ts';
export * from './geminiProvider.ts';
export * from './openaiProvider.ts';
