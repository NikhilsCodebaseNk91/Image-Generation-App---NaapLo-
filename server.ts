import 'dotenv/config';
import express from 'express';
import path from 'path';
import { OUTPUT_TYPES, OUTPUT_TYPE_CONFIGS } from './shared/outputTypes.ts';
import type { HealthCheckResponse } from './shared/types.ts';
import { generateRouter } from './server/routes/generate.ts';
import { outputsRouter } from './server/routes/outputs.ts';
import { getImageProviderConfiguration } from './server/services/imageProvider/index.ts';
import { accessProtectionMiddleware, requestSecurityMiddleware } from './server/middleware/security.ts';
import { isDriveOutputStorageConfigured } from './server/services/driveSource.ts';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const app = express();
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '45mb';

app.disable('x-powered-by');
if (process.env.TRUST_PROXY?.trim().toLowerCase() === 'true') app.set('trust proxy', 1);
app.use(requestSecurityMiddleware);
app.use(accessProtectionMiddleware);

// Enable JSON body parsing with sufficient limit for multiple high-res garment photos
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Health Check endpoint
app.get('/api/health', (req, res) => {
  const providerConfiguration = getImageProviderConfiguration();
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    provider: providerConfiguration.provider,
    model: providerConfiguration.model,
    hasApiKey: providerConfiguration.hasApiKey,
    outputStorageConfigured: isDriveOutputStorageConfigured(),
  };
  res.json(response);
});

// Output Types catalog endpoint
app.get('/api/output-types', (req, res) => {
  res.json({
    outputTypes: OUTPUT_TYPES,
    configs: OUTPUT_TYPE_CONFIGS,
  });
});

// Image Generation & Correction API
app.use('/api', generateRouter);
app.use('/api', outputsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status?: number }).status) : 500;
  if (status === 413) {
    res.status(413).json({ success: false, error: `Request body is too large. Maximum accepted body size is ${JSON_BODY_LIMIT}.` });
    return;
  }
  console.error(JSON.stringify({ event: 'http_error', requestId: res.locals.requestId, status: 500 }));
  res.status(500).json({ success: false, error: 'The server could not process this request.' });
});

// Setup Vite middleware in development, or serve compiled static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[server] Vite middleware mounted for development.');
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[server] Serving production bundle from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NaapLo Catalogue Generator backend running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
