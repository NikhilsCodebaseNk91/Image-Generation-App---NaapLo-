import type { OutputType } from '../../../shared/outputTypes.ts';
import type { ImageFilePayload } from '../../../shared/types.ts';
import type { SystemAsset } from '../systemAssets.ts';

export interface ProviderGenerateRequest {
  productId: string;
  outputType: OutputType;
  masterPrompt: string;
  closeUpTarget?: string;
  correction?: string;
  referenceImages: ImageFilePayload[];
  identityReference?: ImageFilePayload;
  currentGeneratedImage?: ImageFilePayload;
  systemAssets?: {
    logo?: SystemAsset | null;
    multipleOutfitRef?: SystemAsset | null;
  };
  aspectRatio?: string;
  requestedQuality?: 'standard' | 'high' | 'ultra';
}

export interface ProviderGenerateResult {
  mimeType: string;
  base64: string;
  provider: string;
  model: string;
  durationMs: number;
}

export interface ImageGenerationProvider {
  readonly name: string;
  generateImage(request: ProviderGenerateRequest): Promise<ProviderGenerateResult>;
}
