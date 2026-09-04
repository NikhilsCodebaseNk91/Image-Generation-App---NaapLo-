import 'dotenv/config';
import express from 'express';
import path from 'path';
import { OUTPUT_TYPES, OUTPUT_TYPE_CONFIGS } from './shared/outputTypes.ts';
import type { HealthCheckResponse } from './shared/types.ts';
import { generateRouter } from './server/routes/generate.ts';
import { getImageProviderConfiguration } from './server/services/imageProvider/index.ts';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const app = express();

// Enable JSON body parsing with sufficient limit for multiple high-res garment photos
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Health Check endpoint
app.get('/api/health', (req, res) => {
  const providerConfiguration = getImageProviderConfiguration();
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    provider: providerConfiguration.provider,
    model: providerConfiguration.model,
    hasApiKey: providerConfiguration.hasApiKey,
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
