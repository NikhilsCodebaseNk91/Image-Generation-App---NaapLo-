import OpenAI, { toFile } from 'openai';
import type {
  ImageGenerationProvider,
  ProviderGenerateRequest,
  ProviderGenerateResult,
} from './types.ts';
import { assemblePrompt } from '../promptAssembler.ts';

const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_TIMEOUT_MS = 180_000;

function cleanBase64(dataUrlOrBase64: string): string {
  const marker = ';base64,';
  const markerIndex = dataUrlOrBase64.indexOf(marker);
  return markerIndex >= 0
    ? dataUrlOrBase64.slice(markerIndex + marker.length)
    : dataUrlOrBase64;
}

function fileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function requestedSize(aspectRatio?: string): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspectRatio === '1:1') return '1024x1024';
  if (aspectRatio === '4:3' || aspectRatio === '3:2' || aspectRatio === '16:9') {
    return '1536x1024';
  }
  return '1024x1536';
}

function normalizedOpenAIError(error: unknown): Error {
  const value = error as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
  };
  const status = value?.status;
  const code = value?.code || '';
  const name = value?.name || '';
  const message = value?.message || '';

  if (status === 401 || code === 'invalid_api_key') {
    return new Error('OpenAI authentication failed. Verify OPENAI_API_KEY in the server environment.');
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return new Error('OpenAI rate limit or quota was exceeded. Check API billing, limits, and retry later.');
  }
  if (name.includes('Timeout') || code.includes('timeout')) {
    return new Error('OpenAI image generation timed out. Please retry the request.');
  }
  if (status === 400 && (code === 'moderation_blocked' || code === 'content_policy_violation')) {
    return new Error('OpenAI could not generate this image because the request did not meet safety requirements. Revise the prompt or reference images.');
  }
  if (status === 400) {
    return new Error('OpenAI rejected the image request. Check the selected model and uploaded image formats.');
  }
  if (status === 403) {
    return new Error('OpenAI denied access to the selected image model. Check project permissions and model access.');
  }
  if (status && status >= 500) {
    return new Error('OpenAI image generation is temporarily unavailable. Please retry later.');
  }
  if (message.toLowerCase().includes('connection')) {
    return new Error('Could not connect to OpenAI image generation. Check the server network and retry.');
  }
  return new Error('OpenAI image generation failed unexpectedly. Please retry or check the server logs.');
}

export class OpenAIImageProvider implements ImageGenerationProvider {
  public readonly name = 'openai';

  public async generateImage(request: ProviderGenerateRequest): Promise<ProviderGenerateResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured on the server. Add it to the server environment and restart the app.'
      );
    }

    const modelName = process.env.IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL;
    const timeoutValue = Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10);
    const timeout = Number.isFinite(timeoutValue) && timeoutValue > 0
      ? timeoutValue
      : DEFAULT_TIMEOUT_MS;
    const client = new OpenAI({ apiKey, timeout, maxRetries: 1 });
    const { directiveText } = assemblePrompt(request);
    const inputs: Array<{ data: string; mimeType: string; name: string }> = [];

    request.referenceImages.forEach((image, index) => {
      inputs.push({
        data: image.data,
        mimeType: image.mimeType || 'image/jpeg',
        name: image.name || `garment-reference-${index + 1}`,
      });
    });

    if (request.correction && request.currentGeneratedImage) {
      inputs.push({
        data: request.currentGeneratedImage.data,
        mimeType: request.currentGeneratedImage.mimeType || 'image/png',
        name: request.currentGeneratedImage.name || 'current-generated-image',
      });
    }

    if (request.identityReference) {
      inputs.push({
        data: request.identityReference.data,
        mimeType: request.identityReference.mimeType || 'image/png',
        name: request.identityReference.name || 'identity-reference',
      });
    }

    if (request.outputType === 'MULTIPLE OUTFIT VIEW' && request.systemAssets?.multipleOutfitRef) {
      inputs.push({
        data: request.systemAssets.multipleOutfitRef.base64,
        mimeType: request.systemAssets.multipleOutfitRef.mimeType,
        name: 'multiple-outfit-layout-reference',
      });
    }

    if (request.outputType === 'DESCRIPTIVE CATALOGUE POSTER' && request.systemAssets?.logo) {
      inputs.push({
        data: request.systemAssets.logo.base64,
        mimeType: request.systemAssets.logo.mimeType,
        name: 'naaplo-logo',
      });
    }

    const uploadFiles = await Promise.all(
      inputs.map((input, index) => {
        const extension = fileExtension(input.mimeType);
        const safeName = input.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
        return toFile(
          Buffer.from(cleanBase64(input.data), 'base64'),
          `${safeName || `reference-${index + 1}`}.${extension}`,
          { type: input.mimeType }
        );
      })
    );

    const startTime = Date.now();
    try {
      const response = await client.images.edit({
        model: modelName,
        image: uploadFiles,
        prompt: directiveText,
        size: requestedSize(request.aspectRatio),
        quality: request.requestedQuality === 'standard' ? 'medium' : 'high',
        output_format: 'png',
      });

      const generated = response.data?.[0]?.b64_json;
      if (!generated) {
        throw new Error('OPENAI_NO_IMAGE');
      }

      return {
        mimeType: 'image/png',
        base64: generated,
        provider: this.name,
        model: modelName,
        durationMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      if ((error as Error)?.message === 'OPENAI_NO_IMAGE') {
        throw new Error('OpenAI completed the request but returned no image data. Please retry.');
      }
      throw normalizedOpenAIError(error);
    }
  }
}

