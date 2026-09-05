import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const toPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const safeEqual = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

export const requestSecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const requestPath = req.path;
  res.locals.requestId = requestId;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Request-ID', requestId);
  if (requestPath.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  res.on('finish', () => {
    console.log(JSON.stringify({ event: 'http_request', requestId, method: req.method, path: requestPath, status: res.statusCode, durationMs: Date.now() - startedAt }));
  });
  next();
};

export const accessProtectionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.ACCESS_PROTECTION_ENABLED?.trim().toLowerCase() !== 'true') return next();
  const username = process.env.APP_ACCESS_USERNAME || '';
  const password = process.env.APP_ACCESS_PASSWORD || '';
  if (!username || !password) {
    res.status(503).json({ success: false, error: 'Application access protection is not configured.' });
    return;
  }
  const header = req.header('authorization') || '';
  const [scheme, encoded] = header.split(' ', 2);
  if (scheme !== 'Basic' || !encoded) {
    res.setHeader('WWW-Authenticate', 'Basic realm="NaapLo Catalogue Generator", charset="UTF-8"');
    res.status(401).send('Authentication required.');
    return;
  }
  let suppliedUsername = '';
  let suppliedPassword = '';
  try {
    [suppliedUsername, suppliedPassword] = Buffer.from(encoded, 'base64').toString('utf8').split(/:(.*)/s, 2);
  } catch {
    // Invalid credentials follow the same response path as an ordinary mismatch.
  }
  if (!safeEqual(suppliedUsername || '', username) || !safeEqual(suppliedPassword || '', password)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="NaapLo Catalogue Generator", charset="UTF-8"');
    res.status(401).send('Authentication required.');
    return;
  }
  next();
};

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export const generationRateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  const windowMs = toPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
  const maximum = toPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 8);
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = rateBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  res.setHeader('RateLimit-Limit', maximum);
  res.setHeader('RateLimit-Remaining', Math.max(0, maximum - bucket.count));
  res.setHeader('RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
  if (bucket.count > maximum) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ success: false, error: 'Too many image-generation requests. Please wait and retry.' });
    return;
  }
  next();
};

export const resetRateLimitForTests = () => rateBuckets.clear();
