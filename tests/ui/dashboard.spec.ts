import { test, expect } from '@playwright/test';
import { fixture, sourceText } from '../../server/tests/fixtures/qbr';
import type { DocumentDetail } from '@qbr/contracts';

const id = '123e4567-e89b-42d3-a456-426614174000';
const document: DocumentDetail = {
  id, filename: 'Acme.pdf', createdAt: '2026-07-10T09:00:00Z', runId: id,
  status: 'completed', attempts: 1, customer: 'Acme', reportingPeriod: 'Q2 2026', issueCount: 0,
  error: null, result: fixture(), quality: { needsReview: false, issues: [] },
  pages: [{ page: 1, text: sourceText }], model: 'test-only', version: 'qbr-v1', durationMs: 1000,
  inputTokens: 100, outputTokens: 200,
};

// Browser presentation tests use explicit API fixtures. They do not claim live model quality.
test('the local API is reachable', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3001/api/health');
  expect(response.ok()).toBe(true); expect(await response.json()).toEqual({ status: 'ok' });
});
test('empty library and upload controls are usable without horizontal overflow', async ({ page }) => {
  await page.route('**/api/documents?**', route => route.fulfill({ json: { items: [] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'From reports to clarity.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose PDFs' })).toBeVisible();
  await expect(page.getByText('Your uploaded reports will appear here.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('report tabs expose sources, numeric observations and date precision', async ({ page }) => {
  await page.route('**/api/documents?**', route => route.fulfill({ json: { items: [document] } }));
  await page.route(`**/api/documents/${id}`, route => route.fulfill({ json: document }));
  await page.goto('/');
  await page.getByRole('button', { name: /PDF Completed Acme/ }).click();
  await expect(page.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
  await page.getByText('View source', { exact: true }).first().click();
  await expect(page.getByText('Improved adoption.', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'metrics', exact: true }).click();
  await expect(page.getByText('Numeric: 100', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'actions', exact: true }).click();
  await expect(page.getByText('2026-07 · month precision')).toBeVisible();
  await page.getByRole('button', { name: 'source', exact: true }).click();
  await expect(page.locator('.source-page pre')).toContainText('Acme Q2 2026');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('a failed upload displays the server error and re-enables the upload button', async ({ page }) => {
  await page.route('**/api/documents?**', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/documents', route => route.fulfill({ status: 415, json: { error: { code: 'INVALID_PDF', message: 'The uploaded file is not a PDF.' } } }));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') });
  await expect(page.getByText('The uploaded file is not a PDF.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose PDFs' })).toBeEnabled();
});
test('informational notes are separate from findings requiring review', async ({ page }) => {
  const detail = structuredClone(document);
  detail.quality!.issues = [{ path: 'kpis.items[0].observations[0].scope', code: 'MISSING', message: 'Scope not specified.', severity: 'info' }];
  await page.route('**/api/documents?**', route => route.fulfill({ json: { items: [detail] } }));
  await page.route(`**/api/documents/${id}`, route => route.fulfill({ json: detail }));
  await page.goto('/');
  await page.getByRole('button', { name: /PDF Completed Acme/ }).click();
  await page.getByRole('button', { name: 'quality', exact: true }).click();
  await expect(page.getByText('No items require review under the configured checks.')).toBeVisible();
  await page.locator('.information-notes summary').click();
  await expect(page.getByText('Scope not specified.')).toBeVisible();
  await expect(page.locator('.severity-info')).toHaveCount(1);
});
test('source pages retain original numbers and display visual-review warnings', async ({ page }) => {
  const detail = structuredClone(document);
  detail.pages = [
    { page: 1, text: '', extractionStatus: 'blank' },
    { page: 2, text: '', extractionStatus: 'visual_review_required', extractionNote: 'Visual content needs manual review.' },
    { page: 3, text: sourceText, extractionStatus: 'text' },
  ];
  await page.route('**/api/documents?**', route => route.fulfill({ json: { items: [detail] } }));
  await page.route(`**/api/documents/${id}`, route => route.fulfill({ json: detail }));
  await page.goto('/');
  await page.getByRole('button', { name: /PDF Completed Acme/ }).click();
  await page.getByRole('button', { name: 'source', exact: true }).click();
  await expect(page.getByText('Blank page retained for source numbering.')).toBeVisible();
  await expect(page.getByText('Visual content needs manual review.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page 3', exact: true })).toBeVisible();
});
