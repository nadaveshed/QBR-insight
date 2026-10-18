import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { Worker } from 'bullmq';
import type { Server } from 'node:http';
import { app } from '../../src/app.js';
import { pool } from '../../src/config/database.js';
import { projectRoot, uploadDirectory } from '../../src/config/env.js';
import { redisConnection } from '../../src/config/redis.js';
import { QUEUE_NAME } from '../../src/config/queue.js';
import { qbrQueue, dispatchPending } from '../../src/queues/qbr.queue.js';
import { ProcessingService } from '../../src/services/processing.service.js';
import { ExtractionsRepository } from '../../src/repositories/extractions.repository.js';
import { LocalStorageProvider } from '../../src/providers/storage.provider.js';
import { PdfService } from '../../src/services/pdf.service.js';
import { ExtractionService } from '../../src/services/extraction.service.js';
import { ValidationService } from '../../src/services/validation.service.js';
import { sha256 } from '../../src/util/hash.js';
import { fixture } from '../fixtures/qbr.js';
import type { DocumentDetail } from '@qbr/contracts';
import { createQbrWorker } from '../../src/workers/qbr.worker.js';
import { PermanentProcessingError } from '../../src/errors/app.error.js';
import { DocumentsRepository } from '../../src/repositories/documents.repository.js';

// Real HTTP, Redis, PostgreSQL, storage and PDF parsing. The LLM alone is a deterministic test double.
// Stop the regular worker first: it must not compete for jobs in this local integration test.
describe('HTTP → queue → worker → PostgreSQL', () => {
  let server: Server; let base: string; let worker: Worker;
  const documents: string[] = []; const runs: string[] = []; const keys: string[] = [];
  let calls = 0;
  let failNext = false;
  beforeAll(async () => {
    if (await qbrQueue.getWorkersCount() > 0) throw new Error('Stop the application worker before running integration tests.');
    const service = new ProcessingService(new ExtractionsRepository(), new LocalStorageProvider(), new PdfService(), new ExtractionService({
      async extract() { calls++; if (failNext) { failNext = false; throw new PermanentProcessingError('TEST_FAILURE', 'Intentional integration-test failure.'); } return { data: fixture(), inputTokens: 10, outputTokens: 20, diagnostics: { schemaRecovered: false, structuralAdjustments: [] } }; },
    }), new ValidationService());
    worker = createQbrWorker({ service });
    await worker.waitUntilReady();
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test address');
    base = `http://127.0.0.1:${address.port}/api`;
  });
  afterAll(async () => {
    await worker?.close();
    if (server) await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    for (const run of runs) {
      const job = await qbrQueue.getJob(run); if (job) await job.remove();
      await pool.query('DELETE FROM extraction_runs WHERE id=$1', [run]);
    }
    for (const doc of documents) await pool.query('DELETE FROM documents WHERE id=$1', [doc]);
    for (const key of keys) await unlink(resolve(uploadDirectory, key)).catch(() => {});
    await qbrQueue.close(); await pool.end();
  });
  it('persists a reviewable result, exports it, and avoids reprocessing a duplicate', async () => {
    const original = await readFile(resolve(projectRoot, 'data/raw/01_Northwind_Technologies_Q2_2026.pdf'));
    const bytes = Buffer.concat([original, Buffer.from(`\n% integration-${randomUUID()}\n`)]);
    keys.push(`${sha256(bytes)}.pdf`);
    async function upload() {
      const form = new FormData(); form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'integration.pdf');
      return fetch(`${base}/documents`, { method: 'POST', body: form });
    }
    const response = await upload(); expect(response.status).toBe(202);
    const submitted = await response.json() as { documentId: string; runId: string };
    documents.push(submitted.documentId); runs.push(submitted.runId);
    let detail: DocumentDetail | undefined;
    for (let i = 0; i < 100; i++) {
      detail = await (await fetch(`${base}/documents/${submitted.documentId}`)).json() as DocumentDetail;
      if (['completed','needs_review','failed'].includes(detail.status)) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect(detail?.status).toBe('needs_review'); // Fake fixture quotes deliberately disagree with the real PDF.
    expect(detail?.pages[0]?.text).toContain('Northwind');
    expect(detail?.quality?.issues.some(i => i.code === 'EVIDENCE_INVALID')).toBe(true);
    expect(detail?.quality?.extraction).toEqual({ schemaRecovered: false, structuralAdjustments: [] });
    const originalCount = detail!.issueCount;
    await pool.query(`UPDATE extraction_runs SET quality=jsonb_set(quality,'{issues}',(quality->'issues') || $2::jsonb) WHERE id=$1`,
      [submitted.runId, JSON.stringify([{ path: 'kpis.items[0].observations[0].scope', code: 'MISSING', message: 'Optional context not stated.', severity: 'info' }])]);
    const withInformation = await (await fetch(`${base}/documents/${submitted.documentId}`)).json() as DocumentDetail;
    expect(withInformation.issueCount).toBe(originalCount);
    expect(withInformation.quality!.issues.length).toBe(detail!.quality!.issues.length + 1);
    expect((await pool.query('SELECT * FROM kpis WHERE run_id=$1', [submitted.runId])).rowCount).toBe(1);
    expect((await pool.query('SELECT * FROM action_items WHERE run_id=$1', [submitted.runId])).rowCount).toBe(1);
    const duplicate = await (await upload()).json() as { documentId: string; runId: string };
    expect(duplicate).toMatchObject({ documentId: submitted.documentId, runId: submitted.runId }); expect(calls).toBe(1);
    const exported = await fetch(`${base}/documents/${submitted.documentId}/export`);
    expect(exported.status).toBe(200); expect(exported.headers.get('content-disposition')).toContain('.json');
    expect((await fetch(`${base}/documents/${submitted.documentId}/retry`, { method: 'POST' })).status).toBe(409);
  }, 20000);
  it('rejects invalid PDF bytes and malformed identifiers', async () => {
    const form = new FormData(); form.append('file', new Blob(['not pdf']), 'fake.pdf');
    expect((await fetch(`${base}/documents`, { method: 'POST', body: form })).status).toBe(415);
    expect((await fetch(`${base}/documents/not-a-uuid`)).status).toBe(400);
    expect((await fetch(`${base}/documents/${randomUUID()}`)).status).toBe(404);
    expect((await fetch(`${base}/documents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' })).status).toBe(400);
  });
  it('recovers a persisted outbox entry, records permanent failure, and supports manual retry', async () => {
    const original = await readFile(resolve(projectRoot, 'data/raw/02_Globex_Retail_Apr-Jun_2026.pdf'));
    const bytes = Buffer.concat([original, Buffer.from(`\n% outbox-test-${randomUUID()}\n`)]);
    const hash = sha256(bytes); keys.push(`${hash}.pdf`);
    await new LocalStorageProvider().put(`${hash}.pdf`, bytes);
    const submitted = await new DocumentsRepository().create(hash, 'outbox-test.pdf');
    documents.push(submitted.documentId); runs.push(submitted.runId);
    expect(submitted.status).toBe('pending');
    failNext = true;
    await dispatchPending();
    async function waitFor(status: string) {
      for (let i = 0; i < 100; i++) {
        const detail = await (await fetch(`${base}/documents/${submitted.documentId}`)).json() as DocumentDetail;
        if (detail.status === status) return detail;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`Run did not reach ${status}`);
    }
    const failed = await waitFor('failed');
    expect(failed.error).toContain('TEST_FAILURE'); expect(failed.attempts).toBe(1);
    // Wait for the BullMQ state transition as well as the durable database state.
    for (let i = 0; i < 100; i++) {
      if (await (await qbrQueue.getJob(submitted.runId))?.getState() === 'failed') break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect((await fetch(`${base}/documents/${submitted.documentId}/retry`, { method: 'POST' })).status).toBe(202);
    const retried = await waitFor('needs_review');
    expect(retried.error).toBeNull(); expect(retried.attempts).toBe(2);
  }, 20000);
});
