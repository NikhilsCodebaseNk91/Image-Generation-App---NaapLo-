import type { OutputType } from './outputTypes.ts';

export type GenerationQuality = 'draft' | 'final';

export interface GenerationUsage {
  inputTokens?: number;
  inputTextTokens?: number;
  inputImageTokens?: number;
  outputTokens?: number;
  outputImageTokens?: number;
  totalTokens?: number;
}

export interface GenerationCost {
  currency: 'USD';
  amountUsd: number;
  basis: 'PROVIDER_USAGE' | 'OUTPUT_ESTIMATE';
  /** True when reference-image/text input charges are not included. */
  isMinimum: boolean;
  pricingSource: string;
}

export interface ImageFilePayload {
  name: string;
  mimeType: string;
  /** Base64 encoded image data (without or with data: URL prefix) */
  data: string;
}

export interface GenerateApiRequest {
  contractVersion: 'generation-job.v1';
  productId: string;
  outputType: OutputType;
  closeUpTarget?: string;
  correction?: string;
  /** Draft uses the provider's economical quality; final uses its highest configured quality. */
  quality?: GenerationQuality;
  /** Optional operator direction; master-prompt garment fidelity rules remain authoritative. */
  additionalInstructions?: string;
  referenceImages: ImageFilePayload[];
  currentGeneratedImage?: ImageFilePayload;
  /** Successful FRONT output used only for model/person continuity across sibling views. */
  identityReference?: ImageFilePayload;
}

export interface GenerateApiResponse {
  success: boolean;
  image?: {
    mimeType: string;
    base64: string;
    dataUrl: string;
    fileName?: string;
    brandingApplied?: boolean;
    brandingSourceIdentity?: string;
    brandingPosition?: 'TOP_RIGHT';
  };
  productId?: string;
  outputType?: OutputType;
  provider?: string;
  model?: string;
  durationMs?: number;
  usage?: GenerationUsage;
  cost?: GenerationCost;
  error?: string;
  details?: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  provider: string;
  model: string;
  hasApiKey: boolean;
  outputStorageConfigured: boolean;
  brand: ClientBrandConfig;
}

export interface ClientBrandConfig {
  clientDisplayName: string;
  clientLogoUrl: string;
  providerDisplayName: 'VisionxAI';
  providerAttribution: string;
}

export interface ApprovedOutputUploadRequest {
  contractVersion: 'output-approval.v1';
  approved: true;
  productId: string;
  outputType: OutputType;
  image: {
    mimeType: 'image/png';
    base64: string;
    fileName: string;
  };
}

export interface ApprovedOutputUploadResponse {
  success: boolean;
  fileId?: string;
  fileName?: string;
  productFolderId?: string;
  storageUrl?: string;
  error?: string;
}
