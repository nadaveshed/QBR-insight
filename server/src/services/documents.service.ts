import { basename } from 'node:path';
import { DocumentsRepository } from '../repositories/documents.repository.js';
import type { StorageProvider } from '../providers/storage.provider.js';
import { sha256 } from '../util/hash.js';
import { AppError } from '../errors/app.error.js';
import { dispatchRun } from '../queues/qbr.queue.js';
import { logger } from '../util/logger.js';

export class DocumentsService {
  constructor(private readonly repository: DocumentsRepository, private readonly storage: StorageProvider) {}
  async upload(buffer: Buffer, filename: string) {
    if (!buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new AppError(415, 'INVALID_PDF', 'The uploaded file is not a PDF.');
    const hash = sha256(buffer);
    await this.storage.put(`${hash}.pdf`, buffer);
    const result = await this.repository.create(hash, basename(filename).replace(/[\x00-\x1f]/g, '').slice(0, 255));
    if (result.status === 'pending') {
      try { await dispatchRun(result.runId); result.status = 'queued'; }
      catch { logger.warn({ runId: result.runId }, 'Upload persisted; worker will retry queue dispatch'); }
    }
    return result;
  }
  list(search: string, limit: number, offset: number) { return this.repository.list(search, limit, offset); }
  async get(id: string) {
    const doc = await this.repository.get(id);
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found.');
    return doc;
  }
  async retry(id: string) {
    await this.get(id);
    const runId = await this.repository.retry(id);
    if (!runId) throw new AppError(409, 'RETRY_UNAVAILABLE', 'Only failed runs can be retried.');
    try { await dispatchRun(runId); } catch { logger.warn({ runId }, 'Retry pending queue dispatch'); }
    return { documentId: id, runId };
  }
}
