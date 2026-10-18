import { env } from './env.js';

const url = new URL(env.REDIS_URL);
export const redisConnection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  username: url.username ? decodeURIComponent(url.username) : undefined,
  password: url.password ? decodeURIComponent(url.password) : undefined,
  db: Number(url.pathname.slice(1) || 0),
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
};
