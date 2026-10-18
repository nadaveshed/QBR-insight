import type { RequestHandler } from 'express';
import { idSchema } from '../schemas/documents.schema.js';
export const validateDocumentId: RequestHandler = (req, _res, next) => {
  const result = idSchema.safeParse(req.params.id);
  if (!result.success) { next(result.error); return; }
  next();
};
