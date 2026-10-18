import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../config/database.js';
import { projectRoot } from '../config/env.js';

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(76381921)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = resolve(projectRoot, 'server/migrations');
    for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(resolve(directory, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(76381921)'); client.release(); }
}
try { await migrate(); } finally { await pool.end(); }
