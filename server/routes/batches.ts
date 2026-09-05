import { Router, type Request, type Response } from 'express';
import type { AddBatchCatalogueRequest, CreateCatalogueBatchRequest } from '../../shared/batchTypes.ts';
import { OUTPUT_TYPES, type OutputType } from '../../shared/outputTypes.ts';
import { generationRateLimitMiddleware } from '../middleware/security.ts';
import { batchQueue, BatchContractError } from '../services/batchQueue.ts';

export const batchesRouter = Router();

const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { res.json(await fn(req)); }
  catch (error) {
    const status = error instanceof BatchContractError ? 400 : (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 404 : 500;
    if (status === 500) console.error(JSON.stringify({ event: 'batch_api_error', requestId: res.locals.requestId }));
    res.status(status).json({ success: false, error: status === 500 ? 'The batch request could not be completed.' : (error as Error).message });
  }
};

batchesRouter.post('/batches', handle((req) => batchQueue.createBatch(req.body as CreateCatalogueBatchRequest)));
batchesRouter.get('/batches', handle((req) => batchQueue.list(Number.parseInt(String(req.query.limit || '20'), 10))));
batchesRouter.get('/batches/:batchId', handle((req) => batchQueue.getBatch(req.params.batchId)));
batchesRouter.post('/batches/:batchId/catalogues', handle((req) => batchQueue.addCatalogue(req.params.batchId, req.body as AddBatchCatalogueRequest)));
batchesRouter.post('/batches/:batchId/start', generationRateLimitMiddleware, handle((req) => batchQueue.start(req.params.batchId)));
batchesRouter.post('/batches/:batchId/pause', handle((req) => batchQueue.pause(req.params.batchId)));
batchesRouter.post('/batches/:batchId/resume', handle((req) => batchQueue.resume(req.params.batchId)));
batchesRouter.post('/batches/:batchId/cancel', handle((req) => batchQueue.cancel(req.params.batchId)));

const outputTypeFrom = (req: Request): OutputType => {
  const type = decodeURIComponent(req.params.outputType) as OutputType;
  if (!OUTPUT_TYPES.includes(type)) throw new BatchContractError('Unknown output view.');
  return type;
};

batchesRouter.get('/batches/:batchId/catalogues/:catalogueId/views/:outputType', handle((req) => batchQueue.getResult(req.params.batchId, req.params.catalogueId, outputTypeFrom(req))));
batchesRouter.post('/batches/:batchId/catalogues/:catalogueId/views/:outputType/retry', generationRateLimitMiddleware, handle((req) => batchQueue.retry(req.params.batchId, req.params.catalogueId, outputTypeFrom(req))));
batchesRouter.post('/batches/:batchId/catalogues/:catalogueId/views/:outputType/amend', generationRateLimitMiddleware, handle((req) => batchQueue.amend(req.params.batchId, req.params.catalogueId, outputTypeFrom(req), String(req.body?.correction || ''))));
batchesRouter.post('/batches/:batchId/catalogues/:catalogueId/views/:outputType/approve', handle((req) => batchQueue.approve(req.params.batchId, req.params.catalogueId, outputTypeFrom(req))));
