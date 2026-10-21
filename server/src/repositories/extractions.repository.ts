import { pool } from '../config/database.js';
import type { Qbr, QualityResult, SourcePage } from '@qbr/contracts';

export class ExtractionsRepository {
  async load(runId: string) {
    const result = await pool.query<{ id: string; status: string; storage_key: string; model: string }>(
      `SELECT r.id,r.status,r.model,d.storage_key FROM extraction_runs r JOIN documents d ON d.id=r.document_id WHERE r.id=$1`, [runId]);
    return result.rows[0];
  }
  async start(runId: string) {
    await pool.query(`UPDATE extraction_runs SET status='processing',attempts=attempts+1,error=NULL,updated_at=now()
      WHERE id=$1 AND status NOT IN ('completed','needs_review')`, [runId]);
  }
  async savePages(runId: string, pages: SourcePage[]) {
    await pool.query('UPDATE extraction_runs SET pages=$2::jsonb,updated_at=now() WHERE id=$1', [runId, JSON.stringify(pages)]);
  }
  async complete(runId: string, data: Qbr, quality: QualityResult, durationMs: number, inputTokens: number | null, outputTokens: number | null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE extraction_runs SET status=$2,result=$3::jsonb,quality=$4::jsonb,
        duration_ms=$5,input_tokens=$6,output_tokens=$7,error=NULL,updated_at=now() WHERE id=$1`,
      [runId, quality.needsReview ? 'needs_review' : 'completed', JSON.stringify(data), JSON.stringify(quality), durationMs, inputTokens, outputTokens]);
      // Replace projections in the same transaction as the JSON result so a repeated run cannot append duplicates.
      await client.query('DELETE FROM kpis WHERE run_id=$1', [runId]);
      await client.query('DELETE FROM action_items WHERE run_id=$1', [runId]);
      for (const [index, kpi] of data.kpis.items.entries()) {
        await client.query('INSERT INTO kpis(run_id,position,name,status,observations) VALUES($1,$2,$3,$4,$5::jsonb)',
          [runId, index, kpi.name.value, kpi.status, JSON.stringify(kpi.observations)]);
      }
      for (const [index, action] of data.actionItems.items.entries()) {
        await client.query(`INSERT INTO action_items(run_id,position,description,owner,due_date,normalized_due_date,details)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [runId, index, action.description.value, action.owner.value,
          action.dueDate.value, action.dueDate.normalized, JSON.stringify(action)]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async fail(runId: string, message: string, terminal: boolean) {
    await pool.query(`UPDATE extraction_runs SET status=$2,error=$3,updated_at=now()
      WHERE id=$1 AND status NOT IN ('completed','needs_review')`, [runId, terminal ? 'failed' : 'queued', message]);
  }
}
