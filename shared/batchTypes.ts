import type { OutputType } from './outputTypes.ts';
import type { GenerateApiResponse, ImageFilePayload } from './types.ts';

export type BatchQuality = 'draft' | 'final';
export type BatchStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FAILURES'
  | 'CANCELLED'
  | 'FAILED';

export type BatchViewStatus =
  | 'QUEUED'
  | 'BLOCKED_BY_IDENTITY'
  | 'GENERATING'
  | 'SUCCESS'
  | 'FAILED'
  | 'AMENDMENT_REQUESTED'
  | 'APPROVED'
  | 'UPLOAD_QUEUED'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'CANCELLED';

export interface CreateCatalogueBatchRequest {
  contractVersion: 'catalogue-batch.v1';
  expectedCatalogueCount: number;
  defaultOutputTypes: OutputType[];
  defaultQuality: BatchQuality;
}

export interface AddBatchCatalogueRequest {
  contractVersion: 'batch-catalogue.v1';
  productId: string;
  outputTypes: OutputType[];
  closeUpTarget?: string;
  instructions?: string;
  quality: BatchQuality;
  referenceImages: ImageFilePayload[];
}

export interface BatchViewSummary {
  outputType: OutputType;
  status: BatchViewStatus;
  attempts: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  hasResult: boolean;
  identityUsed?: boolean;
  approvedAt?: string;
  storageUrl?: string;
  fileName?: string;
}

export interface BatchCatalogueSummary {
  id: string;
  productId: string;
  quality: BatchQuality;
  outputTypes: OutputType[];
  closeUpTarget?: string;
  instructions?: string;
  referenceCount: number;
  status: 'READY' | 'QUEUED' | 'RUNNING' | 'REVIEW_REQUIRED' | 'COMPLETED' | 'COMPLETED_WITH_FAILURES' | 'CANCELLED';
  views: BatchViewSummary[];
  createdAt: string;
  completedAt?: string;
}

export interface CatalogueBatchSummary {
  contractVersion: 'catalogue-batch-status.v1';
  id: string;
  status: BatchStatus;
  expectedCatalogueCount: number;
  catalogueCount: number;
  defaultOutputTypes: OutputType[];
  defaultQuality: BatchQuality;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  totalViews: number;
  completedViews: number;
  failedViews: number;
  activeViews: number;
  queuedViews: number;
  estimatedRemainingMs: number;
  averageViewDurationMs?: number;
  catalogues: BatchCatalogueSummary[];
}

export interface BatchMutationResponse {
  success: boolean;
  batch?: CatalogueBatchSummary;
  catalogueId?: string;
  error?: string;
}

export interface BatchViewResultResponse extends GenerateApiResponse {
  batchId?: string;
  catalogueId?: string;
  status?: BatchViewStatus;
  approvedAt?: string;
  storageUrl?: string;
}
