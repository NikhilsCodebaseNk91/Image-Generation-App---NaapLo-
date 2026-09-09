import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateGenerationCost } from '../shared/generationCost.ts';
import { BatchQueueService } from '../server/services/batchQueue.ts';
import { BatchStore } from '../server/services/batchStore.ts';

const usageCost = calculateGenerationCost('openai', 'gpt-image-2', 'draft', {
  inputTextTokens: 100,
  inputImageTokens: 1000,
  outputTokens: 2000,
  outputImageTokens: 2000,
});
assert.equal(usageCost?.basis, 'PROVIDER_USAGE');
assert.equal(usageCost?.isMinimum, false);
assert.equal(usageCost?.amountUsd, 0.0685);
assert.equal(calculateGenerationCost('openai', 'gpt-image-2', 'draft')?.amountUsd, 0.005);
assert.equal(calculateGenerationCost('gemini', 'gemini-3.1-flash-image', 'draft'), undefined);

const testRoot = await mkdtemp(path.join(tmpdir(), 'naaplo-cp012-'));
process.env.BATCH_AUTO_RETRIES = '0';
try {
  const queue = new BatchQueueService(
    new BatchStore(testRoot),
    async (request) => ({
      success: true,
      productId: request.productId,
      outputType: request.outputType,
      provider: 'openai',
      model: 'gpt-image-2',
      durationMs: 10,
      cost: { currency: 'USD', amountUsd: 0.02, basis: 'PROVIDER_USAGE', isMinimum: false, pricingSource: 'test' },
      usage: { inputTextTokens: 10, inputImageTokens: 20, outputTokens: 30, outputImageTokens: 30, totalTokens: 60 },
      image: { mimeType: 'image/png', base64: 'aA==', dataUrl: 'data:image/png;base64,aA==', fileName: 'test.png' },
    }),
    async () => ({ fileId: 'file', fileName: 'test.png', productFolderId: 'folder', storageUrl: 'https://drive.google.com/file/d/file/view' }),
    1,
  );
  const batch = await queue.createBatch({ contractVersion: 'catalogue-batch.v1', expectedCatalogueCount: 1, defaultOutputTypes: ['FRONT VIEW'], defaultQuality: 'draft' });
  const added = await queue.addCatalogue(batch.id, {
    contractVersion: 'batch-catalogue.v1', productId: 'COST-001', outputTypes: ['FRONT VIEW'], quality: 'draft',
    referenceImages: [{ name: 'reference.png', mimeType: 'image/png', data: 'aA==' }],
  });
  assert.equal(added.success, true);
  await queue.start(batch.id);
  let summary = await queue.getBatch(batch.id);
  for (let index = 0; index < 100 && summary.catalogues[0].views[0].status !== 'SUCCESS'; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    summary = await queue.getBatch(batch.id);
  }
  assert.equal(summary.accountedGenerationCostUsd, 0.02);
  assert.equal(summary.unpricedAttempts, 0);
  assert.equal(summary.costPerApprovedOutputUsd, undefined);
  await queue.approve(batch.id, summary.catalogues[0].id, 'FRONT VIEW');
  summary = await queue.getBatch(batch.id);
  for (let index = 0; index < 100 && summary.catalogues[0].views[0].status !== 'UPLOADED'; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    summary = await queue.getBatch(batch.id);
  }
  assert.equal(summary.catalogues[0].views[0].status, 'UPLOADED');
  assert.equal(summary.approvedOutputCount, 1);
  assert.equal(summary.costPerApprovedOutputUsd, 0.02);
  const result = await queue.getResult(batch.id, summary.catalogues[0].id, 'FRONT VIEW');
  assert.equal(result.cost?.amountUsd, 0.02);
  assert.equal(result.usage?.totalTokens, 60);
  console.log(JSON.stringify({ pass: true, accountedCostUsd: summary.accountedGenerationCostUsd, costPerApprovedOutputUsd: summary.costPerApprovedOutputUsd }));
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
