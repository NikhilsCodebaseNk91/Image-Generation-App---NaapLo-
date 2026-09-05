import type {
  AddBatchCatalogueRequest,
  BatchCatalogueSummary,
  BatchMutationResponse,
  BatchViewResultResponse,
  BatchViewSummary,
  CatalogueBatchSummary,
  CreateCatalogueBatchRequest,
} from '../../shared/batchTypes.ts';
import { OUTPUT_TYPES, type OutputType } from '../../shared/outputTypes.ts';
import type { GenerateApiRequest, GenerateApiResponse, ImageFilePayload } from '../../shared/types.ts';
import { buildOutputFileName } from '../../shared/outputFileName.ts';
import { BatchStore, type StoredBatch, type StoredBatchView, type StoredCatalogue } from './batchStore.ts';
import { executeGenerationJob } from './generationService.ts';
import { storeApprovedOutput, type StoredOutput } from './outputPersistence.ts';

type GenerateDependency = (request: Partial<GenerateApiRequest>, options: { requestedQuality: 'standard' | 'ultra' }) => Promise<GenerateApiResponse>;
type UploadDependency = (input: { productId: string; outputType: OutputType; base64: string }) => Promise<StoredOutput>;
type QueueJob = { batch: StoredBatch; catalogue: StoredCatalogue; view: StoredBatchView; kind: 'generate' | 'upload'; key: string };

const terminalGeneration = new Set(['SUCCESS', 'FAILED', 'APPROVED', 'UPLOAD_QUEUED', 'UPLOADING', 'UPLOADED', 'CANCELLED']);
const identityReady = new Set(['SUCCESS', 'APPROVED', 'UPLOAD_QUEUED', 'UPLOADING', 'UPLOADED']);
const needsIdentity = (type: OutputType) => type === 'BACK VIEW' || type === 'SIDE VIEW';
const now = () => new Date().toISOString();

export class BatchContractError extends Error {}

export class BatchQueueService {
  private active = 0;
  private pumpScheduled = false;
  private pumping = false;
  private readonly claimed = new Set<string>();
  private readonly catalogueLocks = new Map<string, Promise<void>>();
  private readonly concurrency: number;

  constructor(
    private readonly store = new BatchStore(),
    private readonly generate: GenerateDependency = executeGenerationJob,
    private readonly upload: UploadDependency = storeApprovedOutput,
    concurrency = Number.parseInt(process.env.BATCH_WORKER_CONCURRENCY || '2', 10),
  ) {
    this.concurrency = Math.max(1, Math.min(Number.isFinite(concurrency) ? concurrency : 2, 8));
  }

  async recover(): Promise<void> {
    for (const batch of await this.store.listBatches(100)) {
      let changed = false;
      for (const catalogueId of batch.catalogueIds) {
        const catalogue = await this.store.loadCatalogue(batch.id, catalogueId);
        let catalogueChanged = false;
        for (const view of catalogue.views) {
          if (view.status === 'GENERATING') { view.status = 'QUEUED'; catalogueChanged = changed = true; }
          if (view.status === 'UPLOADING') { view.status = 'UPLOAD_QUEUED'; catalogueChanged = changed = true; }
        }
        if (catalogueChanged) await this.store.saveCatalogue(catalogue);
      }
      if (batch.status === 'RUNNING' || batch.status === 'QUEUED') {
        batch.status = 'RUNNING';
        changed = true;
      }
      if (changed) await this.store.saveBatch(batch);
    }
    this.schedulePump();
  }

  async createBatch(request: CreateCatalogueBatchRequest): Promise<CatalogueBatchSummary> {
    if (request.contractVersion !== 'catalogue-batch.v1') throw new BatchContractError('Expected catalogue-batch.v1.');
    if (!Number.isInteger(request.expectedCatalogueCount) || request.expectedCatalogueCount < 1 || request.expectedCatalogueCount > 30) {
      throw new BatchContractError('A batch must contain between 1 and 30 catalogues.');
    }
    const outputTypes = this.validateOutputTypes(request.defaultOutputTypes);
    if (request.defaultQuality !== 'draft' && request.defaultQuality !== 'final') throw new BatchContractError('Quality must be draft or final.');
    const batch = await this.store.createBatch({ status: 'DRAFT', expectedCatalogueCount: request.expectedCatalogueCount, defaultOutputTypes: outputTypes, defaultQuality: request.defaultQuality });
    return this.summary(batch, []);
  }

  async addCatalogue(batchId: string, request: AddBatchCatalogueRequest): Promise<BatchMutationResponse> {
    const batch = await this.store.loadBatch(batchId);
    if (batch.status !== 'DRAFT') throw new BatchContractError('Catalogues can only be added while the batch is a draft.');
    if (batch.catalogueIds.length >= batch.expectedCatalogueCount) throw new BatchContractError('The expected catalogue count has already been reached.');
    if (request.contractVersion !== 'batch-catalogue.v1') throw new BatchContractError('Expected batch-catalogue.v1.');
    const productId = request.productId?.trim();
    if (!productId || productId.length > 120) throw new BatchContractError('Each catalogue requires a valid Product ID.');
    const existing = await Promise.all(batch.catalogueIds.map((id) => this.store.loadCatalogue(batch.id, id)));
    if (existing.some((item) => item.productId.toLowerCase() === productId.toLowerCase())) throw new BatchContractError(`Product ID ${productId} is duplicated in this batch.`);
    let outputTypes = this.validateOutputTypes(request.outputTypes);
    if (outputTypes.some(needsIdentity) && !outputTypes.includes('FRONT VIEW')) outputTypes = ['FRONT VIEW', ...outputTypes];
    if (outputTypes.includes('CLOSE-UP') && !request.closeUpTarget?.trim()) throw new BatchContractError('A Close-Up Target is required when CLOSE-UP is selected.');
    if (!Array.isArray(request.referenceImages) || request.referenceImages.length < 1 || request.referenceImages.length > 10) throw new BatchContractError('Each catalogue requires 1 to 10 reference images.');
    if (request.quality !== 'draft' && request.quality !== 'final') throw new BatchContractError('Quality must be draft or final.');
    const ordered = [...outputTypes].sort((a, b) => a === 'FRONT VIEW' ? -1 : b === 'FRONT VIEW' ? 1 : OUTPUT_TYPES.indexOf(a) - OUTPUT_TYPES.indexOf(b));
    const catalogue = await this.store.createCatalogue(batch.id, {
      productId,
      quality: request.quality,
      outputTypes: ordered,
      closeUpTarget: request.closeUpTarget?.trim() || undefined,
      instructions: request.instructions?.trim().slice(0, 2000) || undefined,
      referenceImages: request.referenceImages,
      views: ordered.map((outputType) => ({ outputType, status: needsIdentity(outputType) ? 'BLOCKED_BY_IDENTITY' : 'QUEUED', attempts: 0 })),
    });
    batch.catalogueIds.push(catalogue.id);
    await this.store.saveBatch(batch);
    return { success: true, catalogueId: catalogue.id, batch: await this.getBatch(batch.id) };
  }

  async start(batchId: string): Promise<CatalogueBatchSummary> {
    const batch = await this.store.loadBatch(batchId);
    if (batch.status !== 'DRAFT' && batch.status !== 'PAUSED') throw new BatchContractError('Only a draft or paused batch can be started.');
    if (batch.catalogueIds.length !== batch.expectedCatalogueCount) throw new BatchContractError(`Add all ${batch.expectedCatalogueCount} catalogue cards before starting.`);
    batch.status = 'RUNNING';
    batch.startedAt ||= now();
    batch.completedAt = undefined;
    await this.store.saveBatch(batch);
    this.schedulePump();
    return this.getBatch(batch.id);
  }

  async pause(batchId: string): Promise<CatalogueBatchSummary> {
    const batch = await this.store.loadBatch(batchId);
    if (batch.status !== 'RUNNING' && batch.status !== 'QUEUED') throw new BatchContractError('Only a running batch can be paused.');
    batch.status = 'PAUSED';
    await this.store.saveBatch(batch);
    return this.getBatch(batch.id);
  }

  async resume(batchId: string): Promise<CatalogueBatchSummary> { return this.start(batchId); }

  async cancel(batchId: string): Promise<CatalogueBatchSummary> {
    const batch = await this.store.loadBatch(batchId);
    batch.status = 'CANCELLED';
    batch.completedAt = now();
    for (const catalogueId of batch.catalogueIds) {
      const catalogue = await this.store.loadCatalogue(batch.id, catalogueId);
      for (const view of catalogue.views) if (view.status === 'QUEUED' || view.status === 'BLOCKED_BY_IDENTITY' || view.status === 'UPLOAD_QUEUED') view.status = 'CANCELLED';
      await this.store.saveCatalogue(catalogue);
    }
    await this.store.saveBatch(batch);
    return this.getBatch(batch.id);
  }

  async retry(batchId: string, catalogueId: string, outputType: OutputType): Promise<CatalogueBatchSummary> {
    const { batch, catalogue, view } = await this.viewContext(batchId, catalogueId, outputType);
    if (view.status !== 'FAILED' && view.status !== 'BLOCKED_BY_IDENTITY') throw new BatchContractError('Only a failed or identity-blocked view can be retried.');
    view.error = undefined;
    view.correction = undefined;
    view.status = needsIdentity(outputType) && !this.frontReady(catalogue) ? 'BLOCKED_BY_IDENTITY' : 'QUEUED';
    if (outputType === 'FRONT VIEW') for (const sibling of catalogue.views) if (needsIdentity(sibling.outputType) && sibling.status === 'BLOCKED_BY_IDENTITY') sibling.status = 'BLOCKED_BY_IDENTITY';
    batch.status = 'RUNNING';
    batch.completedAt = undefined;
    await this.store.saveCatalogue(catalogue);
    await this.store.saveBatch(batch);
    this.schedulePump();
    return this.getBatch(batch.id);
  }

  async amend(batchId: string, catalogueId: string, outputType: OutputType, correction: string): Promise<CatalogueBatchSummary> {
    const { batch, catalogue, view } = await this.viewContext(batchId, catalogueId, outputType);
    if (!['SUCCESS', 'APPROVED', 'UPLOADED'].includes(view.status)) throw new BatchContractError('Only a successful view can be amended.');
    const clean = correction?.trim();
    if (!clean || clean.length > 2000) throw new BatchContractError('Provide an amendment instruction of 1 to 2000 characters.');
    view.correction = clean;
    view.status = 'QUEUED';
    view.error = undefined;
    view.approvedAt = undefined;
    view.storageUrl = undefined;
    batch.status = 'RUNNING';
    batch.completedAt = undefined;
    await this.store.saveCatalogue(catalogue);
    await this.store.saveBatch(batch);
    this.schedulePump();
    return this.getBatch(batch.id);
  }

  async approve(batchId: string, catalogueId: string, outputType: OutputType): Promise<CatalogueBatchSummary> {
    await this.withCatalogueLock(`${batchId}:${catalogueId}`, async () => {
      const { batch, catalogue, view } = await this.viewContext(batchId, catalogueId, outputType);
      if (view.status !== 'SUCCESS') throw new BatchContractError('Only a successful unapproved view can be approved.');
      view.status = 'UPLOAD_QUEUED';
      view.approvedAt = now();
      await this.store.saveCatalogue(catalogue);
      if (batch.status !== 'PAUSED' && batch.status !== 'CANCELLED') batch.status = 'RUNNING';
      await this.store.saveBatch(batch);
    });
    this.schedulePump();
    return this.getBatch(batchId);
  }

  async getResult(batchId: string, catalogueId: string, outputType: OutputType): Promise<BatchViewResultResponse> {
    const { catalogue, view } = await this.viewContext(batchId, catalogueId, outputType);
    if (!view.fileName || !view.mimeType) throw new BatchContractError('This view does not have a generated result yet.');
    const base64 = await this.store.loadResultBase64(batchId, catalogueId, outputType);
    return {
      success: true, batchId, catalogueId, status: view.status, approvedAt: view.approvedAt, storageUrl: view.storageUrl,
      productId: catalogue.productId, outputType, provider: view.provider, model: view.model, durationMs: view.durationMs,
      image: { mimeType: view.mimeType, base64, dataUrl: `data:${view.mimeType};base64,${base64}`, fileName: view.fileName },
    };
  }

  async getBatch(batchId: string): Promise<CatalogueBatchSummary> {
    const batch = await this.store.loadBatch(batchId);
    const catalogues = await Promise.all(batch.catalogueIds.map((id) => this.store.loadCatalogue(batch.id, id)));
    return this.summary(batch, catalogues);
  }

  async list(limit = 20): Promise<CatalogueBatchSummary[]> {
    const batches = await this.store.listBatches(Math.max(1, Math.min(limit, 100)));
    return Promise.all(batches.map(async (batch) => this.summary(batch, await Promise.all(batch.catalogueIds.map((id) => this.store.loadCatalogue(batch.id, id))))));
  }

  private validateOutputTypes(value: OutputType[]): OutputType[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 9 || value.some((type) => !OUTPUT_TYPES.includes(type))) throw new BatchContractError('Select between 1 and 9 valid output views.');
    return [...new Set(value)];
  }

  private frontReady(catalogue: StoredCatalogue) { return identityReady.has(catalogue.views.find((view) => view.outputType === 'FRONT VIEW')?.status || ''); }

  private async viewContext(batchId: string, catalogueId: string, outputType: OutputType) {
    const batch = await this.store.loadBatch(batchId);
    if (!batch.catalogueIds.includes(catalogueId)) throw new BatchContractError('Catalogue does not belong to this batch.');
    const catalogue = await this.store.loadCatalogue(batchId, catalogueId);
    const view = catalogue.views.find((item) => item.outputType === outputType);
    if (!view) throw new BatchContractError('Requested view does not exist in this catalogue.');
    return { batch, catalogue, view };
  }

  private schedulePump() {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => { this.pumpScheduled = false; void this.pump(); });
  }

  private async withCatalogueLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.catalogueLocks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    this.catalogueLocks.set(key, queued);
    await previous.catch(() => undefined);
    try { return await work(); }
    finally {
      release();
      if (this.catalogueLocks.get(key) === queued) this.catalogueLocks.delete(key);
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.active < this.concurrency) {
        const job = await this.nextJob();
        if (!job) return;
        this.claimed.add(job.key);
        this.active += 1;
        void this.process(job).finally(() => { this.claimed.delete(job.key); this.active -= 1; this.schedulePump(); });
      }
    } finally {
      this.pumping = false;
    }
  }

  private async nextJob(): Promise<QueueJob | null> {
    for (const batch of (await this.store.listBatches(100)).reverse()) {
      if (batch.status !== 'RUNNING') continue;
      for (const catalogueId of batch.catalogueIds) {
        const catalogue = await this.store.loadCatalogue(batch.id, catalogueId);
        if (catalogue.views.some((view) => view.status === 'GENERATING' || view.status === 'UPLOADING')) continue;
        const keyFor = (view: StoredBatchView) => `${batch.id}:${catalogue.id}:${view.outputType}`;
        const uploadView = catalogue.views.find((view) => view.status === 'UPLOAD_QUEUED' && !this.claimed.has(keyFor(view)));
        if (uploadView) return { batch, catalogue, view: uploadView, kind: 'upload', key: keyFor(uploadView) };
        const queued = catalogue.views.find((view) => view.status === 'QUEUED' && !this.claimed.has(keyFor(view)) && (!needsIdentity(view.outputType) || this.frontReady(catalogue)));
        if (queued) return { batch, catalogue, view: queued, kind: 'generate', key: keyFor(queued) };
      }
    }
    return null;
  }

  private async process(job: QueueJob): Promise<void> {
    await this.withCatalogueLock(`${job.batch.id}:${job.catalogue.id}`, async () => {
      const batch = await this.store.loadBatch(job.batch.id);
      const catalogue = await this.store.loadCatalogue(job.batch.id, job.catalogue.id);
      const view = catalogue.views.find((item) => item.outputType === job.view.outputType);
      if (!view) return;
      if (job.kind === 'upload' && view.status === 'UPLOAD_QUEUED') await this.processUpload({ batch, catalogue, view });
      if (job.kind === 'generate' && view.status === 'QUEUED') await this.processGeneration({ batch, catalogue, view });
    });
    await this.refreshBatchStatus(job.batch.id);
  }

  private async processGeneration({ batch, catalogue, view }: { batch: StoredBatch; catalogue: StoredCatalogue; view: StoredBatchView }) {
    view.status = 'GENERATING'; view.startedAt = now(); view.attempts += 1; view.error = undefined;
    await this.store.saveCatalogue(catalogue);
    try {
      let identityReference: ImageFilePayload | undefined;
      if (needsIdentity(view.outputType)) {
        const front = catalogue.views.find((item) => item.outputType === 'FRONT VIEW');
        if (!front?.mimeType) throw new Error('The FRONT identity result is unavailable.');
        const base64 = await this.store.loadResultBase64(batch.id, catalogue.id, 'FRONT VIEW');
        identityReference = { name: front.fileName || 'front-identity.png', mimeType: front.mimeType, data: base64 };
      }
      let currentGeneratedImage: ImageFilePayload | undefined;
      if (view.correction && view.mimeType) {
        const base64 = await this.store.loadResultBase64(batch.id, catalogue.id, view.outputType);
        currentGeneratedImage = { name: view.fileName || 'current-draft.png', mimeType: view.mimeType, data: base64 };
      }
      const result = await this.generate({
        contractVersion: 'generation-job.v1', productId: catalogue.productId, outputType: view.outputType,
        closeUpTarget: catalogue.closeUpTarget, correction: view.correction, additionalInstructions: catalogue.instructions,
        referenceImages: await this.store.loadReferenceImages(catalogue), identityReference, currentGeneratedImage,
      }, { requestedQuality: catalogue.quality === 'draft' ? 'standard' : 'ultra' });
      if (!result.success || !result.image) throw new Error(result.error || 'Generation returned no image.');
      await this.store.saveResult(batch.id, catalogue.id, view.outputType, result);
      Object.assign(view, { status: 'SUCCESS', completedAt: now(), durationMs: result.durationMs, provider: result.provider, model: result.model, fileName: result.image.fileName || buildOutputFileName(catalogue.productId, view.outputType), mimeType: result.image.mimeType, identityUsed: Boolean(identityReference), correction: undefined, approvedAt: undefined, storageUrl: undefined });
      if (view.outputType === 'FRONT VIEW') for (const sibling of catalogue.views) if (needsIdentity(sibling.outputType) && sibling.status === 'BLOCKED_BY_IDENTITY') sibling.status = 'QUEUED';
    } catch (error) {
      view.status = 'FAILED'; view.completedAt = now(); view.error = (error as Error).message;
      if (view.outputType === 'FRONT VIEW') for (const sibling of catalogue.views) if (needsIdentity(sibling.outputType) && !terminalGeneration.has(sibling.status)) { sibling.status = 'BLOCKED_BY_IDENTITY'; sibling.error = 'Waiting for a successful FRONT identity.'; }
    }
    await this.store.saveCatalogue(catalogue);
  }

  private async processUpload({ batch, catalogue, view }: { batch: StoredBatch; catalogue: StoredCatalogue; view: StoredBatchView }) {
    view.status = 'UPLOADING'; view.error = undefined;
    await this.store.saveCatalogue(catalogue);
    try {
      const base64 = await this.store.loadResultBase64(batch.id, catalogue.id, view.outputType);
      const stored = await this.upload({ productId: catalogue.productId, outputType: view.outputType, base64 });
      view.status = 'UPLOADED'; view.storageUrl = stored.storageUrl; view.fileName = stored.fileName;
    } catch (error) {
      view.status = 'SUCCESS'; view.error = `Drive upload failed: ${(error as Error).message}`; view.approvedAt = undefined;
    }
    await this.store.saveCatalogue(catalogue);
  }

  private async refreshBatchStatus(batchId: string) {
    const batch = await this.store.loadBatch(batchId);
    if (batch.status === 'PAUSED' || batch.status === 'CANCELLED') return;
    const catalogues = await Promise.all(batch.catalogueIds.map((id) => this.store.loadCatalogue(batch.id, id)));
    const views = catalogues.flatMap((catalogue) => catalogue.views);
    if (views.some((view) => ['QUEUED', 'GENERATING', 'UPLOAD_QUEUED', 'UPLOADING'].includes(view.status))) batch.status = 'RUNNING';
    else if (views.some((view) => view.status === 'SUCCESS' || view.status === 'FAILED' || view.status === 'BLOCKED_BY_IDENTITY')) batch.status = views.some((view) => view.status === 'SUCCESS') ? 'REVIEW_REQUIRED' : 'COMPLETED_WITH_FAILURES';
    else if (views.some((view) => view.status === 'FAILED' || view.status === 'CANCELLED')) batch.status = 'COMPLETED_WITH_FAILURES';
    else batch.status = 'COMPLETED';
    if (['COMPLETED', 'COMPLETED_WITH_FAILURES'].includes(batch.status)) batch.completedAt = now();
    await this.store.saveBatch(batch);
  }

  private summary(batch: StoredBatch, catalogues: StoredCatalogue[]): CatalogueBatchSummary {
    const allViews = catalogues.flatMap((catalogue) => catalogue.views);
    const completed = allViews.filter((view) => terminalGeneration.has(view.status));
    const durations = completed.map((view) => view.durationMs).filter((value): value is number => typeof value === 'number' && value > 0);
    const average = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : Number.parseInt(process.env.BATCH_ESTIMATED_VIEW_MS || '90000', 10);
    const activeViews = allViews.filter((view) => view.status === 'GENERATING' || view.status === 'UPLOADING').length;
    const queuedViews = allViews.filter((view) => view.status === 'QUEUED' || view.status === 'BLOCKED_BY_IDENTITY' || view.status === 'UPLOAD_QUEUED').length;
    return {
      contractVersion: 'catalogue-batch-status.v1', id: batch.id, status: batch.status,
      expectedCatalogueCount: batch.expectedCatalogueCount, catalogueCount: catalogues.length,
      defaultOutputTypes: batch.defaultOutputTypes, defaultQuality: batch.defaultQuality, createdAt: batch.createdAt,
      startedAt: batch.startedAt, completedAt: batch.completedAt, totalViews: allViews.length,
      completedViews: completed.length, failedViews: allViews.filter((view) => view.status === 'FAILED' || view.status === 'BLOCKED_BY_IDENTITY').length,
      activeViews, queuedViews, estimatedRemainingMs: Math.ceil(queuedViews / this.concurrency) * average,
      averageViewDurationMs: durations.length ? average : undefined,
      catalogues: catalogues.map((catalogue) => this.catalogueSummary(catalogue)),
    };
  }

  private catalogueSummary(catalogue: StoredCatalogue): BatchCatalogueSummary {
    const statuses = catalogue.views.map((view) => view.status);
    const status: BatchCatalogueSummary['status'] = statuses.every((value) => value === 'UPLOADED') ? 'COMPLETED'
      : statuses.some((value) => value === 'GENERATING' || value === 'UPLOADING') ? 'RUNNING'
      : statuses.some((value) => value === 'QUEUED' || value === 'BLOCKED_BY_IDENTITY' || value === 'UPLOAD_QUEUED') ? 'QUEUED'
      : statuses.some((value) => value === 'SUCCESS' || value === 'FAILED') ? 'REVIEW_REQUIRED'
      : statuses.some((value) => value === 'CANCELLED' || value === 'FAILED') ? 'COMPLETED_WITH_FAILURES' : 'READY';
    return {
      id: catalogue.id, productId: catalogue.productId, quality: catalogue.quality, outputTypes: catalogue.outputTypes,
      closeUpTarget: catalogue.closeUpTarget, instructions: catalogue.instructions, referenceCount: catalogue.referenceImages.length,
      status, views: catalogue.views.map((view): BatchViewSummary => ({
        outputType: view.outputType, status: view.status, attempts: view.attempts, error: view.error, startedAt: view.startedAt,
        completedAt: view.completedAt, durationMs: view.durationMs, hasResult: Boolean(view.fileName), identityUsed: view.identityUsed,
        approvedAt: view.approvedAt, storageUrl: view.storageUrl, fileName: view.fileName,
      })), createdAt: catalogue.createdAt, completedAt: catalogue.completedAt,
    };
  }
}

export const batchQueue = new BatchQueueService();
