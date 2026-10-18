import type { RequestHandler } from 'express';
import { DocumentsService } from '../services/documents.service.js';
import { AppError } from '../errors/app.error.js';
import { listQuerySchema } from '../schemas/documents.schema.js';
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}
  upload: RequestHandler = async (req, res) => {
    if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Upload a PDF using the file field.');
    const result = await this.service.upload(req.file.buffer, req.file.originalname);
    res.status(202).location(`/api/documents/${result.documentId}`).json(result);
  };
  list: RequestHandler = async (req, res) => {
    const { search, limit, offset } = listQuerySchema.parse(req.query);
    res.json({ items: await this.service.list(search, limit, offset), limit, offset });
  };
  get: RequestHandler = async (req, res) => { res.json(await this.service.get(String(req.params.id))); };
  retry: RequestHandler = async (req, res) => { res.status(202).json(await this.service.retry(String(req.params.id))); };
  export: RequestHandler = async (req, res) => {
    const data = await this.service.get(String(req.params.id));
    res.attachment(`qbr-${data.id}.json`).json(data);
  };
}
