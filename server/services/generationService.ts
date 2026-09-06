import { OUTPUT_TYPES, type OutputType } from '../../shared/outputTypes.ts';
import type { GenerateApiRequest, GenerateApiResponse, ImageFilePayload } from '../../shared/types.ts';
import { buildOutputFileName } from '../../shared/outputFileName.ts';
import { applyNaapLoBranding, normalizeGeneratedImageToPng, requiresNaapLoBranding } from './branding.ts';
import { getImageProvider } from './imageProvider/index.ts';
import type { ProviderGenerateRequest } from './imageProvider/types.ts';
import { loadMasterPrompt } from './masterPrompt.ts';
import { getMultipleOutfitRefAsset, getNaapLoLogoAsset } from './systemAssets.ts';

const MAX_REFERENCE_IMAGES = 10;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_IMAGE_BYTES = Number.parseInt(process.env.MAX_IMAGE_BYTES || String(12 * 1024 * 1024), 10);
const MAX_TOTAL_REFERENCE_BYTES = Number.parseInt(process.env.MAX_TOTAL_REFERENCE_BYTES || String(36 * 1024 * 1024), 10);

export class GenerationValidationError extends Error {}

const imagePayloadBytes = (data: string) => {
  const base64 = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) return -1;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
};

const validateImage = (img: { mimeType?: string; data?: string }, label: string) => {
  if (!img.data) return `${label} is missing image payload data.`;
  const mimeType = (img.mimeType || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) return `${label} uses an unsupported format. Please upload JPEG, PNG, or WebP images.`;
  if (img.data.startsWith('data:') && !img.data.toLowerCase().startsWith(`data:${mimeType};base64,`)) return `${label} data does not match its declared image format.`;
  const bytes = imagePayloadBytes(img.data);
  if (bytes < 0) return `${label} contains invalid base64 image data.`;
  if (bytes > MAX_IMAGE_BYTES) return `${label} exceeds the ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)} MB per-image limit.`;
  return null;
};

function invalid(message: string): never {
  throw new GenerationValidationError(message);
}

export function validateReferenceImageSet(referenceImages: ImageFilePayload[]): void {
  if (referenceImages.length === 0) invalid('At least one garment reference photograph is required to generate a catalogue image.');
  if (referenceImages.length > MAX_REFERENCE_IMAGES) invalid(`Maximum ${MAX_REFERENCE_IMAGES} reference photographs allowed per job. You provided ${referenceImages.length}.`);
  let totalReferenceBytes = 0;
  for (let index = 0; index < referenceImages.length; index += 1) {
    const validationError = validateImage(referenceImages[index], `Reference image #${index + 1}`);
    if (validationError) invalid(validationError);
    totalReferenceBytes += imagePayloadBytes(referenceImages[index].data);
  }
  if (totalReferenceBytes > MAX_TOTAL_REFERENCE_BYTES) invalid(`Reference images exceed the ${Math.floor(MAX_TOTAL_REFERENCE_BYTES / 1024 / 1024)} MB combined limit.`);
}

export async function executeGenerationJob(
  body: Partial<GenerateApiRequest>,
  options: { requestedQuality?: ProviderGenerateRequest['requestedQuality'] } = {},
): Promise<GenerateApiResponse> {
  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const outputType = body.outputType as OutputType;
  const closeUpTarget = typeof body.closeUpTarget === 'string' ? body.closeUpTarget.trim() : '';
  const correction = typeof body.correction === 'string' ? body.correction.trim() : '';
  const additionalInstructions = typeof body.additionalInstructions === 'string' ? body.additionalInstructions.trim() : '';
  const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];
  const currentGeneratedImage = body.currentGeneratedImage;
  const identityReference = body.identityReference;

  if (body.contractVersion !== 'generation-job.v1') invalid('Unsupported or missing contractVersion. Expected "generation-job.v1".');
  if (!productId) invalid('Product ID is required for every generation job.');
  if (productId.length > 120 || closeUpTarget.length > 300 || correction.length > 2000 || additionalInstructions.length > 2000) invalid('One or more text fields exceed the accepted length limit.');
  if (!outputType) invalid('Output Type is required. Please select one of the approved catalogue views.');
  if (!OUTPUT_TYPES.includes(outputType)) invalid(`Invalid Output Type "${outputType}". Must be one of: ${OUTPUT_TYPES.join(', ')}`);
  validateReferenceImageSet(referenceImages);
  for (const [label, image] of [['Current generated image', currentGeneratedImage], ['Identity reference', identityReference]] as const) {
    if (!image) continue;
    const validationError = validateImage(image, label);
    if (validationError) invalid(validationError);
  }
  if (outputType === 'CLOSE-UP' && !closeUpTarget) invalid('Close-Up Target is strictly required when "CLOSE-UP" output type is selected.');
  if (correction && !currentGeneratedImage) invalid('Correction instruction provided, but the current generated image is missing from the payload.');

  const masterPromptDocument = await loadMasterPrompt();
  const systemAssets: ProviderGenerateRequest['systemAssets'] = {};
  if (outputType === 'MULTIPLE OUTFIT VIEW') systemAssets.multipleOutfitRef = await getMultipleOutfitRefAsset();

  const provider = getImageProvider();
  const result = await provider.generateImage({
    productId,
    outputType,
    masterPrompt: masterPromptDocument.content,
    closeUpTarget: closeUpTarget || undefined,
    correction: correction || undefined,
    additionalInstructions: additionalInstructions || undefined,
    referenceImages,
    currentGeneratedImage,
    identityReference,
    systemAssets,
    aspectRatio: '3:4',
    requestedQuality: options.requestedQuality || 'ultra',
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

  return {
    success: true,
    image: {
      mimeType: finalImage.mimeType,
      base64: finalImage.base64,
      dataUrl: `data:${finalImage.mimeType};base64,${finalImage.base64}`,
      fileName: buildOutputFileName(productId, outputType),
      brandingApplied: finalImage.brandingApplied,
      brandingSourceIdentity: finalImage.brandingSourceIdentity,
      brandingPosition: finalImage.brandingPosition,
    },
    productId,
    outputType,
    provider: result.provider,
    model: result.model,
    durationMs: result.durationMs,
  };
}
