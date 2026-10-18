import { Router } from 'express';
import { DocumentsController } from '../controllers/documents.controller.js';
import { DocumentsService } from '../services/documents.service.js';
import { DocumentsRepository } from '../repositories/documents.repository.js';
import { LocalStorageProvider } from '../providers/storage.provider.js';
import { uploadPdf } from '../middleware/upload.middleware.js';
import { validateDocumentId } from '../middleware/validate.middleware.js';

const controller = new DocumentsController(new DocumentsService(new DocumentsRepository(), new LocalStorageProvider()));
export const documentsRouter = Router();
documentsRouter.post('/', uploadPdf, controller.upload);
documentsRouter.get('/', controller.list);
documentsRouter.get('/:id', validateDocumentId, controller.get);
documentsRouter.get('/:id/export', validateDocumentId, controller.export);
documentsRouter.post('/:id/retry', validateDocumentId, controller.retry);
