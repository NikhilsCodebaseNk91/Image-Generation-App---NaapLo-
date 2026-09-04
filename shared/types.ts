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
  referenceImages: ImageFilePayload[];
  currentGeneratedImage?: ImageFilePayload;
}

export interface GenerateApiResponse {
  success: boolean;
  image?: {
    mimeType: string;
    base64: string;
    dataUrl: string;
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
}
