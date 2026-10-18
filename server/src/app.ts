import express from 'express';
import helmet from 'helmet';
import { documentsRouter } from './routes/documents.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { requestId } from './middleware/request-id.middleware.js';
import { pool } from './config/database.js';
import { qbrQueue } from './queues/qbr.queue.js';
import { env } from './config/env.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(requestId);
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/ready', async (_req, res) => {
  const checks = await Promise.allSettled([pool.query('SELECT 1'), qbrQueue.getJobCounts('waiting')]);
  const database = checks[0].status === 'fulfilled', queue = checks[1].status === 'fulfilled';
  res.status(database && queue ? 200 : 503).json({ database, queue, aiConfigured: Boolean(env.DEEPSEEK_API_KEY.trim()) });
});
app.use('/api/documents', documentsRouter);
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
app.use(errorHandler);
