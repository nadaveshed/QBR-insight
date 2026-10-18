import { createQbrWorker } from './workers/qbr.worker.js';
import { dispatchPending, qbrQueue } from './queues/qbr.queue.js';
import { pool } from './config/database.js';
import { logger } from './util/logger.js';

const worker = createQbrWorker();
const dispatcher = setInterval(() => void dispatchPending(), 5000);
void dispatchPending();
logger.info('QBR worker started');
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(dispatcher);
  const deadline = setTimeout(() => process.exit(1), 150000).unref();
  await worker.close();
  await Promise.allSettled([pool.end(), qbrQueue.close()]);
  clearTimeout(deadline);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
