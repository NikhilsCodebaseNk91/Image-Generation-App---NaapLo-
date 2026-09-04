import { Router, type Request, type Response } from 'express';
import { OUTPUT_TYPES, OUTPUT_TYPE_CONFIGS, type OutputType } from '../../shared/outputTypes.ts';
import type { GenerateApiRequest, GenerateApiResponse } from '../../shared/types.ts';
import { loadMasterPrompt } from '../services/masterPrompt.ts';
import { getNaapLoLogoAsset, getMultipleOutfitRefAsset } from '../services/systemAssets.ts';
import { getImageProvider } from '../services/imageProvider/index.ts';

export const generateRouter = Router();

// Maximum allowed reference images in Phase 1
const MAX_REFERENCE_IMAGES = 10;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

generateRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<GenerateApiRequest>;

    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const outputType = body.outputType as OutputType;
    const closeUpTarget = typeof body.closeUpTarget === 'string' ? body.closeUpTarget.trim() : '';
    const correction = typeof body.correction === 'string' ? body.correction.trim() : '';
    const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];
    const currentGeneratedImage = body.currentGeneratedImage;

    // 1. Validate Output Type
    if (!outputType) {
      res.status(400).json({
        success: false,
        error: 'Output Type is required. Please select one of the approved catalogue views.',
      } satisfies GenerateApiResponse);
      return;
    }

    if (!OUTPUT_TYPES.includes(outputType)) {
      res.status(400).json({
        success: false,
        error: `Invalid Output Type "${outputType}". Must be one of: ${OUTPUT_TYPES.join(', ')}`,
      } satisfies GenerateApiResponse);
      return;
    }

    // 2. Validate Reference Images
    if (referenceImages.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one garment reference photograph is required to generate a catalogue image.',
      } satisfies GenerateApiResponse);
      return;
    }

    if (referenceImages.length > MAX_REFERENCE_IMAGES) {
      res.status(400).json({
        success: false,
        error: `Maximum ${MAX_REFERENCE_IMAGES} reference photographs allowed per job. You provided ${referenceImages.length}.`,
      } satisfies GenerateApiResponse);
      return;
    }

    for (let i = 0; i < referenceImages.length; i++) {
      const img = referenceImages[i];
      if (!img.data) {
        res.status(400).json({
          success: false,
          error: `Reference image #${i + 1} (${img.name || 'unnamed'}) is missing image payload data.`,
        } satisfies GenerateApiResponse);
        return;
      }
      if (img.mimeType && !ALLOWED_MIME_TYPES.includes(img.mimeType.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: `Unsupported image format "${img.mimeType}". Please upload JPEG, PNG, or WebP images.`,
        } satisfies GenerateApiResponse);
        return;
      }
    }

    // 3. Validate CLOSE-UP target requirement
    if (outputType === 'CLOSE-UP' && !closeUpTarget) {
      res.status(400).json({
        success: false,
        error: 'Close-Up Target is strictly required when "CLOSE-UP" output type is selected (e.g., "Neckline & Yoke Embroidery", "Daman Lace Border").',
      } satisfies GenerateApiResponse);
      return;
    }

    // 4. Validate Correction requirements
    if (correction && !currentGeneratedImage) {
      res.status(400).json({
        success: false,
        error: 'Correction instruction provided, but the current generated image is missing from the payload.',
      } satisfies GenerateApiResponse);
      return;
    }

    // 5. Load authoritative master prompt
    const masterPrompt = await loadMasterPrompt();

    // 6. Gather required system assets based on output type
    const systemAssets: {
      logo?: Awaited<ReturnType<typeof getNaapLoLogoAsset>>;
      multipleOutfitRef?: Awaited<ReturnType<typeof getMultipleOutfitRefAsset>>;
    } = {};

    if (outputType === 'MULTIPLE OUTFIT VIEW') {
      systemAssets.multipleOutfitRef = await getMultipleOutfitRefAsset();
    }

    if (outputType === 'DESCRIPTIVE CATALOGUE POSTER') {
      systemAssets.logo = await getNaapLoLogoAsset();
    }

    // 7. Execute generation through the ImageGenerationProvider abstraction
    const provider = getImageProvider();
    const result = await provider.generateImage({
      productId,
      outputType,
      masterPrompt,
      closeUpTarget: closeUpTarget || undefined,
      correction: correction || undefined,
      referenceImages,
      currentGeneratedImage,
      systemAssets,
      aspectRatio: '3:4', // Portrait catalogue aspect ratio supported by Gemini
      requestedQuality: 'ultra',
    });

    res.json({
      success: true,
      image: {
        mimeType: result.mimeType,
        base64: result.base64,
        dataUrl: `data:${result.mimeType};base64,${result.base64}`,
      },
      productId,
      outputType,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
    } satisfies GenerateApiResponse);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[API /api/generate error]:', error.message);

    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred during image generation.',
    } satisfies GenerateApiResponse);
  }
});
