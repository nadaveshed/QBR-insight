import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAME, jobOptions } from '../config/queue.js';
import { pool } from '../config/database.js';
import type { ProcessingJob } from '../types/processing.types.js';
import { logger } from '../util/logger.js';

export const qbrQueue = new Queue<ProcessingJob>(QUEUE_NAME, {
  connection: { ...redisConnection, maxRetriesPerRequest: 1, connectTimeout: 3000, enableOfflineQueue: false },
  defaultJobOptions: jobOptions,
});
qbrQueue.on('error', () => logger.warn('Queue connection unavailable'));

// Pending database rows are the durable outbox. A crash between DB commit and enqueue is recoverable.
export async function dispatchRun(runId: string) {
  const existing = await qbrQueue.getJob(runId);
  if (existing && await existing.getState() === 'failed') await existing.remove();
  await qbrQueue.add('extract', { runId }, { jobId: runId });
  await pool.query("UPDATE extraction_runs SET status='queued',updated_at=now() WHERE id=$1 AND status='pending'", [runId]);
}
let dispatching = false;
export async function dispatchPending() {
  if (dispatching) return;
  dispatching = true;
  try {
    const rows = await pool.query<{ id: string }>(`SELECT id FROM extraction_runs
      WHERE status='pending' OR (status='queued' AND updated_at < now()-interval '30 seconds') LIMIT 100`);
    for (const row of rows.rows) await dispatchRun(row.id);
  } catch { logger.warn('Dispatch deferred; pending runs remain in PostgreSQL'); }
  finally { dispatching = false; }
}
