import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { qbrQueue } from './queues/qbr.queue.js';
import { logger } from './util/logger.js';

const server = app.listen(env.PORT, env.HOST, () => logger.info({ host: env.HOST, port: env.PORT }, 'QBR API listening'));
server.on('error', () => { logger.error('API failed to bind its configured port'); process.exitCode = 1; void shutdown(); });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 15000).unref();
  server.close(async () => {
    await Promise.allSettled([pool.end(), qbrQueue.close()]);
    clearTimeout(deadline);
  });
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
