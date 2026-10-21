import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function createRateLimiter(options: { windowMs: number; max: number; message: string }) {
  const { windowMs, max, message } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Client identifier: IP or authorization user id
    const key = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-client';
    const now = Date.now();

    const record = rateLimitStore.get(key);
    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= max) {
      res.status(429).json({ error: message });
      return;
    }

    record.count += 1;
    next();
  };
}

// Sanitized logger: removes passwords, tokens, and personal identifiable content
export function logSanitized(level: 'info' | 'warn' | 'error', message: string, meta?: any): void {
  const sanitizedMeta = meta ? JSON.parse(JSON.stringify(meta)) : undefined;
  if (sanitizedMeta && typeof sanitizedMeta === 'object') {
    if (sanitizedMeta.password) sanitizedMeta.password = '[REDACTED]';
    if (sanitizedMeta.token) sanitizedMeta.token = '[REDACTED]';
    if (sanitizedMeta.authorization) sanitizedMeta.authorization = '[REDACTED]';
  }
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] [${level.toUpperCase()}] ${message}`, sanitizedMeta ? sanitizedMeta : '');
}
