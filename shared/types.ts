import type { OutputType } from './outputTypes.ts';

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
