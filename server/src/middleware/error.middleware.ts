import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../errors/app.error.js';
import { logger } from '../util/logger.js';
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let status = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred.';
  if (error instanceof AppError) { status = error.statusCode; code = error.code; message = error.message; }
  else if (error instanceof ZodError) { status = 400; code = 'INVALID_INPUT'; message = 'Invalid request parameters.'; }
  else if (error instanceof SyntaxError && 'status' in error && error.status === 400) { status = 400; code = 'INVALID_JSON'; message = 'The request body is not valid JSON.'; }
  else if (error instanceof MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code; message = error.code === 'LIMIT_FILE_SIZE' ? 'PDF exceeds the upload size limit.' : 'Upload exactly one PDF using the file field.';
  }
  if (status === 500) logger.error({ requestId: res.locals.requestId, errorType: error instanceof Error ? error.name : 'unknown' }, 'Request failed');
  res.status(status).json({ error: { code, message, requestId: res.locals.requestId } });
};
