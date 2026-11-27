import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from './config.js';

type LogFields = Record<string, unknown>;

export function logEvent(event: string, fields: LogFields = {}): void {
  if (config.NODE_ENV === 'test') return;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'umu-hr-api', event, ...fields }));
}

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  res.on('finish', () => {
    logEvent('http.request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
};
