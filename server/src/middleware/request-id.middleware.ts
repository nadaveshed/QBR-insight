import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../util/logger.js';
export const requestId: RequestHandler = (req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  const start = Date.now();
  const path = req.originalUrl.split('?')[0];
  res.on('finish', () => logger.info({ requestId: id, method: req.method, path, status: res.statusCode, durationMs: Date.now() - start }, 'HTTP request'));
  next();
};
