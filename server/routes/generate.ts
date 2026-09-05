import { Router, type Request, type Response } from 'express';
import type { GenerateApiRequest, GenerateApiResponse } from '../../shared/types.ts';
import { generationRateLimitMiddleware } from '../middleware/security.ts';
import { ImageProviderError } from '../services/imageProvider/errors.ts';
import { executeGenerationJob, GenerationValidationError } from '../services/generationService.ts';

export const generateRouter = Router();

generateRouter.post('/generate', generationRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await executeGenerationJob(req.body as Partial<GenerateApiRequest>);
    res.json(result);
  } catch (error: unknown) {
    console.error(JSON.stringify({ event: 'generation_error', requestId: res.locals.requestId }));
    if (error instanceof GenerationValidationError) {
      res.status(400).json({ success: false, error: error.message } satisfies GenerateApiResponse);
      return;
    }
    const publicMessage = error instanceof ImageProviderError
      ? error.message
      : 'Image generation failed. Please retry or contact the administrator.';
    res.status(500).json({ success: false, error: publicMessage } satisfies GenerateApiResponse);
  }
});
