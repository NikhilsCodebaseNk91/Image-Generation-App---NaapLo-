import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GenerateApiRequest, GenerateApiResponse } from '../shared/types.ts';
import type { OutputType } from '../shared/outputTypes.ts';
import { BatchQueueService } from '../server/services/batchQueue.ts';
import { BatchStore } from '../server/services/batchStore.ts';

process.env.BATCH_AUTO_RETRIES = '0';
process.env.BATCH_AUTO_RETRY_DELAY_MS = '0';

const root = await mkdtemp(path.join(tmpdir(), 'visionxai-cp013-'));
const image = Buffer.from('cp013-fixture').toString('base64');
const calls: Array<Partial<GenerateApiRequest>> = [];
const uploads: Array<{ productId: string; outputType: OutputType }> = [];
let active = 0;
let maximumActive = 0;
let injectedFailurePending = true;

const generate = async (request: Partial<GenerateApiRequest>): Promise<GenerateApiResponse> => {
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  calls.push(request);
  await new Promise((resolve) => setTimeout(resolve, 15));
  active -= 1;
  if (request.productId === 'CP013-003' && request.outputType === 'SIDE VIEW' && injectedFailurePending) {
    injectedFailurePending = false;
    throw new Error('Deterministic isolated failure.');
  }
  return {
    success: true,
    productId: request.productId,
    outputType: request.outputType,
    provider: 'cp013-fixture',
    model: 'deterministic',
    durationMs: 15,
    cost: { currency: 'USD', amountUsd: 0.01, basis: 'PROVIDER_USAGE', isMinimum: false, pricingSource: 'cp013-fixture' },
    image: { mimeType: 'image/png', base64: image, dataUrl: `data:image/png;base64,${image}`, fileName: `fixture-${request.productId}-${request.outputType}.png` },
  };
};

const upload = async (input: { productId: string; outputType: OutputType }) => {
  uploads.push(input);
  return { fileId: `${input.productId}-${input.outputType}`, fileName: `fixture-${input.productId}.png`, productFolderId: input.productId, storageUrl: `https://drive.google.com/file/d/${input.productId}/view` };
};

const waitFor = async (queue: BatchQueueService, batchId: string, statuses: string[], timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const summary = await queue.getBatch(batchId);
    if (statuses.includes(summary.status)) return summary;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${statuses.join(' or ')}.`);
};

try {
  const queue = new BatchQueueService(new BatchStore(root), generate, upload, 2);
  const batch = await queue.createBatch({ contractVersion: 'catalogue-batch.v1', expectedCatalogueCount: 3, defaultOutputTypes: ['FRONT VIEW', 'BACK VIEW', 'SIDE VIEW'], defaultQuality: 'draft' });
  const catalogueIds: string[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const added = await queue.addCatalogue(batch.id, {
      contractVersion: 'batch-catalogue.v1', productId: `CP013-00${index}`, operatorTag: `fixture-${index}`,
      outputTypes: ['FRONT VIEW', 'BACK VIEW', 'SIDE VIEW'], quality: 'draft',
      referenceImages: [{ name: `source-${index}.png`, mimeType: 'image/png', data: image }],
    });
    catalogueIds.push(added.catalogueId!);
  }
  await queue.start(batch.id);
  let summary = await waitFor(queue, batch.id, ['REVIEW_REQUIRED', 'COMPLETED_WITH_FAILURES']);
  assert.equal(summary.totalViews, 9);
  assert.equal(summary.completedViews, 9);
  assert.equal(summary.failedViews, 1);
  assert.equal(maximumActive, 2);
  assert.equal(calls.filter((call) => call.outputType === 'BACK VIEW' || call.outputType === 'SIDE VIEW').every((call) => Boolean(call.identityReference)), true);

  const reference = await queue.getReference(batch.id, catalogueIds[0], 0);
  assert.equal(reference.name, 'source-1.png');
  assert.equal(reference.data, image);

  await queue.retry(batch.id, catalogueIds[2], 'SIDE VIEW');
  summary = await waitFor(queue, batch.id, ['REVIEW_REQUIRED']);
  assert.equal(summary.failedViews, 0);

  await queue.amend(batch.id, catalogueIds[0], 'FRONT VIEW', 'Reduce the background contrast only.');
  summary = await waitFor(queue, batch.id, ['REVIEW_REQUIRED']);
  assert.equal(calls.some((call) => call.correction === 'Reduce the background contrast only.' && Boolean(call.currentGeneratedImage)), true);

  await queue.approveAll(batch.id);
  summary = await waitFor(queue, batch.id, ['COMPLETED']);
  assert.equal(summary.approvedOutputCount, 9);
  assert.equal(uploads.length, 9);
  assert.equal(summary.catalogues.flatMap((catalogue) => catalogue.views).every((view) => view.status === 'UPLOADED'), true);
  assert.equal(Number(summary.accountedGenerationCostUsd.toFixed(2)), 0.10);

  const paused = await queue.createBatch({ contractVersion: 'catalogue-batch.v1', expectedCatalogueCount: 1, defaultOutputTypes: ['FRONT VIEW'], defaultQuality: 'draft' });
  await queue.addCatalogue(paused.id, { contractVersion: 'batch-catalogue.v1', productId: 'CP013-PAUSE', outputTypes: ['FRONT VIEW'], quality: 'draft', referenceImages: [{ name: 'pause.png', mimeType: 'image/png', data: image }] });
  await queue.start(paused.id);
  assert.equal((await queue.pause(paused.id)).status, 'PAUSED');
  await queue.resume(paused.id);
  assert.equal((await waitFor(queue, paused.id, ['REVIEW_REQUIRED'])).completedViews, 1);

  const cancelled = await queue.createBatch({ contractVersion: 'catalogue-batch.v1', expectedCatalogueCount: 1, defaultOutputTypes: ['FRONT VIEW'], defaultQuality: 'draft' });
  await queue.addCatalogue(cancelled.id, { contractVersion: 'batch-catalogue.v1', productId: 'CP013-CANCEL', outputTypes: ['FRONT VIEW'], quality: 'draft', referenceImages: [{ name: 'cancel.png', mimeType: 'image/png', data: image }] });
  await queue.start(cancelled.id);
  assert.equal((await queue.cancel(cancelled.id)).status, 'CANCELLED');

  // Cancellation is accepted immediately while an already-dispatched fixture
  // call finishes cooperatively. Let that bounded call settle before removing
  // the temporary persistence directory.
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(JSON.stringify({ pass: true, catalogues: 3, views: 9, maximumActive, identityLinkedRequests: calls.filter((call) => call.identityReference).length, retries: 1, amendments: 1, uploads: uploads.length, pauseResume: true, cancel: true, accountedCostUsd: summary.accountedGenerationCostUsd }));
} finally {
  await rm(root, { recursive: true, force: true });
}
