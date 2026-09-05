import { Router, type Request, type Response } from 'express';
import { OUTPUT_TYPES, type OutputType } from '../../shared/outputTypes.ts';
import { buildOutputFileName } from '../../shared/outputFileName.ts';
import type { ApprovedOutputUploadRequest, ApprovedOutputUploadResponse } from '../../shared/types.ts';
import { storeApprovedOutput } from '../services/outputPersistence.ts';

export const outputsRouter = Router();
const MAX_OUTPUT_BYTES = Number.parseInt(process.env.MAX_OUTPUT_BYTES || String(20 * 1024 * 1024), 10);

outputsRouter.post('/outputs/approve', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<ApprovedOutputUploadRequest>;
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const outputType = body.outputType as OutputType;
    const image = body.image;
    if (body.contractVersion !== 'output-approval.v1' || body.approved !== true || !productId || !OUTPUT_TYPES.includes(outputType)) {
      res.status(400).json({ success: false, error: 'A valid explicit output approval is required.' } satisfies ApprovedOutputUploadResponse);
      return;
    }
    const expectedFileName = buildOutputFileName(productId, outputType);
    if (!image || image.mimeType !== 'image/png' || image.fileName !== expectedFileName || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64) || image.base64.length % 4 !== 0) {
      res.status(400).json({ success: false, error: 'The approved output payload is invalid.' } satisfies ApprovedOutputUploadResponse);
      return;
    }
    const bytes = Buffer.from(image.base64, 'base64').length;
    if (bytes === 0 || bytes > MAX_OUTPUT_BYTES) {
      res.status(400).json({ success: false, error: 'The approved output exceeds the accepted size limit.' } satisfies ApprovedOutputUploadResponse);
      return;
    }
    if (!process.env.DRIVE_OUTPUT_FOLDER_ID?.trim()) {
      res.status(503).json({ success: false, error: 'Approved-output Drive storage is not configured yet.' } satisfies ApprovedOutputUploadResponse);
      return;
    }
    const stored = await storeApprovedOutput({ productId, outputType, base64: image.base64 });
    res.json({ success: true, ...stored } satisfies ApprovedOutputUploadResponse);
  } catch {
    console.error(JSON.stringify({ event: 'approved_output_upload_error', requestId: res.locals.requestId }));
    res.status(500).json({ success: false, error: 'The approved output could not be stored.' } satisfies ApprovedOutputUploadResponse);
  }
});
