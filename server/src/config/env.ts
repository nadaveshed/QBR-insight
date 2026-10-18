import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
config({ path: resolve(projectRoot, 'server/.env'), quiet: true });
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().default('postgres://qbr:qbr_local@127.0.0.1:55432/qbr'),
  REDIS_URL: z.url().default('redis://127.0.0.1:56379'),
  DEEPSEEK_API_KEY: z.string().default(''),
  DEEPSEEK_MODEL: z.string().default('deepseek-flash'),
  UPLOAD_DIR: z.string().default('data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(50).default(10),
  MAX_DOCUMENT_PAGES: z.coerce.number().int().positive().default(50),
  MAX_DOCUMENT_CHARS: z.coerce.number().int().positive().default(80000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  QUEUE_RATE_MAX: z.coerce.number().int().positive().default(10),
  QUEUE_RATE_DURATION_MS: z.coerce.number().int().positive().default(60000),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});
export const env = schema.parse(process.env);
export const uploadDirectory = resolve(projectRoot, env.UPLOAD_DIR);
