import { Worker, UnrecoverableError } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAME } from '../config/queue.js';
import { env } from '../config/env.js';
import { ExtractionsRepository } from '../repositories/extractions.repository.js';
import { LocalStorageProvider } from '../providers/storage.provider.js';
import { DeepSeekProvider } from '../providers/llm.provider.js';
import { PdfService } from '../services/pdf.service.js';
import { ExtractionService } from '../services/extraction.service.js';
import { ValidationService } from '../services/validation.service.js';
import { ProcessingService } from '../services/processing.service.js';
import { PermanentProcessingError } from '../errors/app.error.js';
import { logger } from '../util/logger.js';
import type { ProcessingJob } from '../types/processing.types.js';

export function createQbrWorker(options: { service?: ProcessingService } = {}) {
  const repository = new ExtractionsRepository();
  const service = options.service ?? new ProcessingService(repository, new LocalStorageProvider(), new PdfService(), new ExtractionService(new DeepSeekProvider()), new ValidationService());
  const worker = new Worker<ProcessingJob>(QUEUE_NAME, async job => {
    try { await service.process(job.data.runId); }
    catch (error) {
      const permanent = error instanceof PermanentProcessingError;
      const terminal = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const message = permanent ? `${error.code}: ${error.message}` : 'Processing failed. A temporary provider or infrastructure failure occurred, or the model output did not match the schema.';
      await repository.fail(job.data.runId, message, terminal);
      logger.warn({ runId: job.data.runId, terminal, errorType: error instanceof Error ? error.name : 'unknown' }, 'Processing attempt failed');
      if (permanent) throw new UnrecoverableError(message);
      throw new Error(message);
    }
  }, {
    connection: { ...redisConnection, maxRetriesPerRequest: null },
    concurrency: env.WORKER_CONCURRENCY,
    limiter: { max: env.QUEUE_RATE_MAX, duration: env.QUEUE_RATE_DURATION_MS },
  });
  worker.on('error', () => logger.error('Worker connection error'));
  worker.on('failed', job => logger.warn({ runId: job?.data.runId }, 'Queue attempt failed'));
  worker.on('completed', job => logger.info({ runId: job.data.runId }, 'Processing completed'));
  return worker;
}
