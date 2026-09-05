import { Router, type Request, type Response } from 'express';
import { OUTPUT_TYPES, OUTPUT_TYPE_CONFIGS, type OutputType } from '../../shared/outputTypes.ts';
import type { GenerateApiRequest, GenerateApiResponse } from '../../shared/types.ts';
import { loadMasterPrompt } from '../services/masterPrompt.ts';
import { getNaapLoLogoAsset, getMultipleOutfitRefAsset } from '../services/systemAssets.ts';
import { getImageProvider } from '../services/imageProvider/index.ts';
import { generationRateLimitMiddleware } from '../middleware/security.ts';
import { applyNaapLoBranding, normalizeGeneratedImageToPng, requiresNaapLoBranding } from '../services/branding.ts';
import { buildOutputFileName } from '../../shared/outputFileName.ts';
import { ImageProviderError } from '../services/imageProvider/errors.ts';

export const generateRouter = Router();

// Maximum allowed reference images in Phase 1
const MAX_REFERENCE_IMAGES = 10;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_IMAGE_BYTES = Number.parseInt(process.env.MAX_IMAGE_BYTES || String(12 * 1024 * 1024), 10);
const MAX_TOTAL_REFERENCE_BYTES = Number.parseInt(process.env.MAX_TOTAL_REFERENCE_BYTES || String(36 * 1024 * 1024), 10);

const imagePayloadBytes = (data: string) => {
  const base64 = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) return -1;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
};

const validateImage = (img: { name?: string; mimeType?: string; data?: string }, label: string) => {
  if (!img.data) return `${label} is missing image payload data.`;
  const mimeType = (img.mimeType || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) return `${label} uses an unsupported format. Please upload JPEG, PNG, or WebP images.`;
  if (img.data.startsWith('data:') && !img.data.toLowerCase().startsWith(`data:${mimeType};base64,`)) return `${label} data does not match its declared image format.`;
  const bytes = imagePayloadBytes(img.data);
  if (bytes < 0) return `${label} contains invalid base64 image data.`;
  if (bytes > MAX_IMAGE_BYTES) return `${label} exceeds the ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)} MB per-image limit.`;
  return null;
};

generateRouter.post('/generate', generationRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<GenerateApiRequest>;

    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const outputType = body.outputType as OutputType;
    const closeUpTarget = typeof body.closeUpTarget === 'string' ? body.closeUpTarget.trim() : '';
    const correction = typeof body.correction === 'string' ? body.correction.trim() : '';
    const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];
    const currentGeneratedImage = body.currentGeneratedImage;
    const identityReference = body.identityReference;

    // 1. Validate application contract and product identity
    if (body.contractVersion !== 'generation-job.v1') {
      res.status(400).json({
        success: false,
        error: 'Unsupported or missing contractVersion. Expected "generation-job.v1".',
      } satisfies GenerateApiResponse);
      return;
    }

    if (!productId) {
      res.status(400).json({
        success: false,
        error: 'Product ID is required for every generation job.',
      } satisfies GenerateApiResponse);
      return;
    }
    if (productId.length > 120 || closeUpTarget.length > 300 || correction.length > 2000) {
      res.status(400).json({ success: false, error: 'One or more text fields exceed the accepted length limit.' } satisfies GenerateApiResponse);
      return;
    }

    // 2. Validate Output Type
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

    // 3. Validate Reference Images
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

    let totalReferenceBytes = 0;
    for (let i = 0; i < referenceImages.length; i++) {
      const img = referenceImages[i];
      const validationError = validateImage(img, `Reference image #${i + 1}`);
      if (validationError) { res.status(400).json({ success: false, error: validationError } satisfies GenerateApiResponse); return; }
      totalReferenceBytes += imagePayloadBytes(img.data);
    }
    if (totalReferenceBytes > MAX_TOTAL_REFERENCE_BYTES) {
      res.status(400).json({ success: false, error: `Reference images exceed the ${Math.floor(MAX_TOTAL_REFERENCE_BYTES / 1024 / 1024)} MB combined limit.` } satisfies GenerateApiResponse);
      return;
    }
    for (const [label, image] of [['Current generated image', currentGeneratedImage], ['Identity reference', identityReference]] as const) {
      if (!image) continue;
      const validationError = validateImage(image, label);
      if (validationError) { res.status(400).json({ success: false, error: validationError } satisfies GenerateApiResponse); return; }
    }

    // 4. Validate CLOSE-UP target requirement
    if (outputType === 'CLOSE-UP' && !closeUpTarget) {
      res.status(400).json({
        success: false,
        error: 'Close-Up Target is strictly required when "CLOSE-UP" output type is selected (e.g., "Neckline & Yoke Embroidery", "Daman Lace Border").',
      } satisfies GenerateApiResponse);
      return;
    }

    // 5. Validate Correction requirements
    if (correction && !currentGeneratedImage) {
      res.status(400).json({
        success: false,
        error: 'Correction instruction provided, but the current generated image is missing from the payload.',
      } satisfies GenerateApiResponse);
      return;
    }

    // 6. Load authoritative master prompt
    const masterPromptDocument = await loadMasterPrompt();

    // 7. Gather required system assets based on output type
    const systemAssets: {
      logo?: Awaited<ReturnType<typeof getNaapLoLogoAsset>>;
      multipleOutfitRef?: Awaited<ReturnType<typeof getMultipleOutfitRefAsset>>;
    } = {};

    if (outputType === 'MULTIPLE OUTFIT VIEW') {
      systemAssets.multipleOutfitRef = await getMultipleOutfitRefAsset();
    }

    // 8. Execute generation through the ImageGenerationProvider abstraction
    const provider = getImageProvider();
    const result = await provider.generateImage({
      productId,
      outputType,
      masterPrompt: masterPromptDocument.content,
      closeUpTarget: closeUpTarget || undefined,
      correction: correction || undefined,
      referenceImages,
      currentGeneratedImage,
      identityReference,
      systemAssets,
      aspectRatio: '3:4', // Portrait catalogue aspect ratio supported by Gemini
      requestedQuality: 'ultra',
    });

    let finalImage: {
      mimeType: string;
      base64: string;
      brandingApplied?: boolean;
      brandingSourceIdentity?: string;
      brandingPosition?: 'TOP_RIGHT';
    } = await normalizeGeneratedImageToPng(result.base64);

    if (requiresNaapLoBranding(outputType)) {
      const logo = await getNaapLoLogoAsset();
      if (!logo) throw new Error('The approved NaapLo logo asset is unavailable.');
      finalImage = await applyNaapLoBranding(result.base64, logo);
    }

    const fileName = buildOutputFileName(productId, outputType);

    res.json({
      success: true,
      image: {
        mimeType: finalImage.mimeType,
        base64: finalImage.base64,
        dataUrl: `data:${finalImage.mimeType};base64,${finalImage.base64}`,
        fileName,
        brandingApplied: finalImage.brandingApplied,
        brandingSourceIdentity: finalImage.brandingSourceIdentity,
        brandingPosition: finalImage.brandingPosition,
      },
      productId,
      outputType,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
    } satisfies GenerateApiResponse);
  } catch (err: unknown) {
    console.error(JSON.stringify({ event: 'generation_error', requestId: res.locals.requestId }));

    const publicMessage = err instanceof ImageProviderError
      ? err.message
      : 'Image generation failed. Please retry or contact the administrator.';

    res.status(500).json({
      success: false,
      error: publicMessage,
    } satisfies GenerateApiResponse);
  }
});
