import { GoogleGenAI } from '@google/genai';
import type {
  ImageGenerationProvider,
  ProviderGenerateRequest,
  ProviderGenerateResult,
} from './types.ts';
import { assemblePrompt } from '../promptAssembler.ts';

/**
 * Strips data URL prefix if present to return raw base64 string
 */
function cleanBase64(dataUrlOrBase64: string): string {
  if (dataUrlOrBase64.includes(';base64,')) {
    return dataUrlOrBase64.split(';base64,')[1];
  }
  return dataUrlOrBase64;
}

export class GeminiImageProvider implements ImageGenerationProvider {
  public readonly name = 'gemini';

  public async generateImage(request: ProviderGenerateRequest): Promise<ProviderGenerateResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured on the server. Please add your Gemini API key in environment or AI Studio Secrets.'
      );
    }

    const modelName = process.env.IMAGE_MODEL || 'gemini-3.1-flash-image';

    const startTime = Date.now();

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Assemble the master prompt and job directives
    const { directiveText } = assemblePrompt(request);

    // Build multimodal content parts
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Add reference images first (ground truth)
    for (let i = 0; i < request.referenceImages.length; i++) {
      const ref = request.referenceImages[i];
      parts.push({
        text: `[Garment Reference Image ${i + 1} of ${request.referenceImages.length}: ${ref.name || 'Raw Garment Photograph'}]`,
      });
      parts.push({
        inlineData: {
          mimeType: ref.mimeType || 'image/jpeg',
          data: cleanBase64(ref.data),
        },
      });
    }

    // If correcting, add the current generated image
    if (request.correction && request.currentGeneratedImage) {
      parts.push({
        text: `[Current Generated Image to be Corrected]: Review this image against the client's correction request: "${request.correction}"`,
      });
      parts.push({
        inlineData: {
          mimeType: request.currentGeneratedImage.mimeType || 'image/png',
          data: cleanBase64(request.currentGeneratedImage.data),
        },
      });
    }

    // If MULTIPLE OUTFIT VIEW, include system composition layout reference
    if (request.outputType === 'MULTIPLE OUTFIT VIEW' && request.systemAssets?.multipleOutfitRef) {
      parts.push({
        text: '[System Composition Reference for Multiple Outfit View]: Use solely for pose and layout arrangement. DO NOT copy this garment.',
      });
      parts.push({
        inlineData: {
          mimeType: request.systemAssets.multipleOutfitRef.mimeType,
          data: request.systemAssets.multipleOutfitRef.base64,
        },
      });
    }

    // If DESCRIPTIVE CATALOGUE POSTER, include approved NaapLo Logo asset
    if (request.outputType === 'DESCRIPTIVE CATALOGUE POSTER' && request.systemAssets?.logo) {
      parts.push({
        text: '[NaapLo Official Brand Logo]: Incorporate this luxury brand mark cleanly into the catalogue poster composition.',
      });
      parts.push({
        inlineData: {
          mimeType: request.systemAssets.logo.mimeType,
          data: request.systemAssets.logo.base64,
        },
      });
    }

    // Add main directive instructions
    parts.push({
      text: directiveText,
    });

    // Image configuration: Standard portrait aspect ratio (3:4) and high resolution (2K)
    const aspectRatio = request.aspectRatio || '3:4';
    const imageSize = request.requestedQuality === 'ultra' ? '2K' : '2K';

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts,
        },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('Gemini returned an empty candidate list for image generation.');
      }

      const responseParts = candidates[0].content?.parts;
      if (!responseParts || responseParts.length === 0) {
        throw new Error('Gemini response candidate contains no content parts.');
      }

      // Find the generated image part
      for (const part of responseParts) {
        if (part.inlineData && part.inlineData.data) {
          const durationMs = Date.now() - startTime;
          return {
            mimeType: part.inlineData.mimeType || 'image/png',
            base64: part.inlineData.data,
            provider: this.name,
            model: modelName,
            durationMs,
          };
        }
      }

      // Check if text was returned instead of image (e.g. refusal or explanation)
      const textOutput = responseParts
        .filter((p) => Boolean(p.text))
        .map((p) => p.text)
        .join(' ')
        .trim();

      if (textOutput) {
        throw new Error(
          `Gemini returned a text response instead of an image: "${textOutput.slice(0, 300)}"`
        );
      }

      throw new Error('Gemini finished generation successfully but returned no image data.');
    } catch (err: unknown) {
      const error = err as Error;
      const msg = error.message || String(error);

      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(
          'Gemini API Quota Exceeded: The model "gemini-3.1-flash-image" requires a billing-enabled Gemini API project or paid tier quota. Please check your API key and plan details in AI Studio.'
        );
      }

      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        throw new Error(
          'Invalid GEMINI_API_KEY: The provided Gemini API key is invalid. Please verify the key in your settings.'
        );
      }

      throw new Error(`Gemini Image Generation Error: ${msg}`);
    }
  }
}
