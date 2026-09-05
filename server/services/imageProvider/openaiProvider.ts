import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import type {
  ImageGenerationProvider,
  ProviderGenerateRequest,
  ProviderGenerateResult,
} from './types.ts';
import { assemblePrompt } from '../promptAssembler.ts';
import { ImageProviderError } from './errors.ts';

const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_TIMEOUT_MS = 180_000;
const OPENAI_IMAGE_PROMPT_MAX_CHARS = 32_000;
const OPENAI_INPUT_MAX_EDGE = 2_048;
const MAX_DECODED_INPUT_PIXELS = 40_000_000;

function cleanBase64(dataUrlOrBase64: string): string {
  const marker = ';base64,';
  const markerIndex = dataUrlOrBase64.indexOf(marker);
  return markerIndex >= 0
    ? dataUrlOrBase64.slice(markerIndex + marker.length)
    : dataUrlOrBase64;
}

function requestedSize(aspectRatio?: string): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspectRatio === '1:1') return '1024x1024';
  if (aspectRatio === '4:3' || aspectRatio === '3:2' || aspectRatio === '16:9') {
    return '1536x1024';
  }
  return '1024x1536';
}

async function normalizeOpenAIInput(input: { data: string; name: string }): Promise<Buffer> {
  const source = Buffer.from(cleanBase64(input.data), 'base64');

  try {
    return await sharp(source, {
      failOn: 'error',
      limitInputPixels: MAX_DECODED_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: OPENAI_INPUT_MAX_EDGE,
        height: OPENAI_INPUT_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch {
    throw new ImageProviderError(
      `The uploaded image "${input.name}" could not be decoded. Re-export it as a standard JPG or PNG and upload it again.`,
      'invalid_image_file'
    );
  }
}

function normalizedOpenAIError(error: unknown): ImageProviderError {
  const value = error as {
    status?: number;
    code?: string;
    param?: string;
    type?: string;
    name?: string;
    message?: string;
    requestID?: string;
  };
  const status = value?.status;
  const code = value?.code || '';
  const name = value?.name || '';
  const message = value?.message || '';

  if (status === 401 || code === 'invalid_api_key') {
    return new ImageProviderError('OpenAI authentication failed. Verify OPENAI_API_KEY in the server environment.', code || 'authentication_failed');
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return new ImageProviderError('OpenAI rate limit or quota was exceeded. Wait before retrying and check API billing or usage limits.', code || 'rate_limit_exceeded');
  }
  if (name.includes('Timeout') || code.includes('timeout')) {
    return new ImageProviderError('OpenAI image generation timed out. Please retry the request.', code || 'timeout');
  }
  if (status === 400 && (code === 'moderation_blocked' || code === 'content_policy_violation')) {
    return new ImageProviderError('OpenAI could not generate this image because the request did not meet safety requirements. Revise the prompt or reference images.', code);
  }
  if (status === 400) {
    return new ImageProviderError(`OpenAI rejected the image request${code ? ` (${code})` : ''}. Check the request inputs.`, code || 'invalid_request');
  }
  if (status === 403) {
    return new ImageProviderError('OpenAI denied access to the selected image model. Check project permissions and model access.', code || 'access_denied');
  }
  if (status && status >= 500) {
    return new ImageProviderError('OpenAI image generation is temporarily unavailable. Please retry later.', code || 'provider_unavailable');
  }
  if (message.toLowerCase().includes('connection')) {
    return new ImageProviderError('Could not connect to OpenAI image generation. Check the server network and retry.', code || 'connection_failed');
  }
  return new ImageProviderError('OpenAI image generation failed unexpectedly. Please retry or check the server logs.', code || 'unexpected_provider_error');
}

function logOpenAIError(error: unknown): void {
  const value = error as {
    status?: number;
    code?: string;
    param?: string;
    type?: string;
    name?: string;
    requestID?: string;
  };

  console.error(JSON.stringify({
    event: 'openai_image_error',
    status: value?.status,
    code: value?.code,
    param: value?.param,
    type: value?.type,
    name: value?.name,
    requestId: value?.requestID,
  }));
}

export class OpenAIImageProvider implements ImageGenerationProvider {
  public readonly name = 'openai';

  public async generateImage(request: ProviderGenerateRequest): Promise<ProviderGenerateResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ImageProviderError(
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
    if (directiveText.length > OPENAI_IMAGE_PROMPT_MAX_CHARS) {
      throw new ImageProviderError(
        `The compiled catalogue instructions exceed the OpenAI ${OPENAI_IMAGE_PROMPT_MAX_CHARS.toLocaleString()}-character image prompt limit.`
      );
    }
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
      inputs.map(async (input, index) => {
        const safeName = input.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
        const normalized = await normalizeOpenAIInput(input);
        return toFile(
          normalized,
          `${safeName || `reference-${index + 1}`}.png`,
          { type: 'image/png' }
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
        throw new ImageProviderError('OpenAI completed the request but returned no image data. Please retry.', 'no_image_returned');
      }
      logOpenAIError(error);
      throw normalizedOpenAIError(error);
    }
  }
}
