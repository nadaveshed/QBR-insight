import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { EXTRACTION_VERSION, type DocumentDetail, type DocumentSummary } from '@qbr/contracts';

const selection = `d.id, d.filename, d.created_at AS "createdAt", r.id AS "runId",
  r.status, r.attempts, r.result->'customer'->>'value' AS customer,
  r.result->'reportingPeriod'->>'value' AS "reportingPeriod",
  (SELECT count(*)::int FROM jsonb_array_elements(COALESCE(r.quality->'issues','[]'::jsonb)) issue
    WHERE COALESCE(issue->>'severity','warning') <> 'info') AS "issueCount", r.error`;
const joined = `FROM documents d JOIN LATERAL
  (SELECT * FROM extraction_runs WHERE document_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true`;

export class DocumentsRepository {
  async create(hash: string, filename: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const doc = await client.query<{ id: string }>(`INSERT INTO documents(id,sha256,filename,storage_key)
        VALUES($1,$2,$3,$4) ON CONFLICT(sha256) DO UPDATE SET sha256=EXCLUDED.sha256 RETURNING id`,
      [randomUUID(), hash, filename, `${hash}.pdf`]);
      const documentId = doc.rows[0]!.id;
      const run = await client.query<{ id: string; status: string }>(`INSERT INTO extraction_runs(id,document_id,version,model)
        VALUES($1,$2,$3,$4) ON CONFLICT(document_id,version,model) DO UPDATE SET version=EXCLUDED.version RETURNING id,status`,
      [randomUUID(), documentId, EXTRACTION_VERSION, env.DEEPSEEK_MODEL]);
      await client.query('COMMIT');
      return { documentId, runId: run.rows[0]!.id, status: run.rows[0]!.status };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async list(search: string, limit: number, offset: number) {
    const result = await pool.query<DocumentSummary>(`SELECT ${selection} ${joined}
      WHERE concat_ws(' ',d.filename,r.result->'customer'->>'value',r.result->'reportingPeriod'->>'value') ILIKE $1
      ORDER BY d.created_at DESC,d.id LIMIT $2 OFFSET $3`, [`%${search.replace(/[\\%_]/g, '\\$&')}%`, limit, offset]);
    return result.rows;
  }
  async get(id: string) {
    const result = await pool.query<DocumentDetail>(`SELECT ${selection}, r.result,r.quality,r.pages,r.model,r.version,
      r.duration_ms AS "durationMs",r.input_tokens AS "inputTokens",r.output_tokens AS "outputTokens"
      ${joined} WHERE d.id=$1`, [id]);
    return result.rows[0] ?? null;
  }
  async retry(id: string) {
    const result = await pool.query<{ id: string }>(`UPDATE extraction_runs SET status='pending',error=NULL,updated_at=now()
      WHERE id=(SELECT id FROM extraction_runs WHERE document_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1)
      AND status='failed' RETURNING id`, [id]);
    return result.rows[0]?.id ?? null;
  }
}
