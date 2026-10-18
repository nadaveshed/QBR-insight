import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PdfService } from '../../src/services/pdf.service.js';
import { projectRoot } from '../../src/config/env.js';
import { pdfFixture } from '../fixtures/pdf.js';

const cases = [
  ['01_Northwind_Technologies_Q2_2026.pdf', ['Monthly Active Users 640 875', 'Sarah Levi 15 July 2026']],
  ['02_Globex_Retail_Apr-Jun_2026.pdf', ['64% adoption', '68%', '01/08/26', 'April-June 2026']],
  ['03_Contoso_Manufacturing_QBR_Notes.pdf', ['Active users: 318', 'No dates were agreed']],
  ['04_BluePeak_Financial_Services_Business_Review.pdf', ['Users 1,142 Activated accounts 1,087', 'Original Q2 objective', 'August 5']],
  ['05_Apex_Healthcare_Account_Update.pdf', ['approximately 520 active users', 'Active users 524', 'September 2026']],
  ['06_Vertex_Logistics_Quarterly_Review.pdf', ['Transactions processed during June: 2.4M', 'Original target for Q2 was 900', 'Not recorded August 2026']],
] as const;
describe('Real assignment PDFs', () => {
  it.each(cases)('preserves critical facts and table associations in %s', async (name, facts) => {
    const pages = await new PdfService().extract(await readFile(resolve(projectRoot, 'data/raw', name)));
    expect(pages).toHaveLength(1); expect(pages[0]!.page).toBe(1);
    for (const fact of facts) expect(pages[0]!.text).toContain(fact);
  });
  it('reports an unreadable PDF explicitly', async () => {
    await expect(new PdfService().extract(Buffer.from('%PDF-1.4\nnot a valid PDF'))).rejects.toMatchObject({ code: 'PDF_UNREADABLE' });
  });
});

describe('Sparse, blank and graphical pages', () => {
  it('accepts a short text cover and blank trailing page without renumbering sources', async () => {
    const pages = await new PdfService().extract(pdfFixture([
      { text: 'QBR' }, { text: 'Acme Q2 2026. Active users 100. The quarter goal was achieved.' }, {},
    ]));
    expect(pages.map(p => p.page)).toEqual([1, 2, 3]);
    expect(pages[0]!.text).toBe('QBR');
    expect(pages[0]!.extractionStatus).toBe('text');
    expect(pages[1]!.text).toContain('Active users 100');
    expect(pages[2]!.extractionStatus).toBe('blank');
  });
  it.each(['vector', 'image'] as const)('retains and flags a %s cover in a mixed document', async graphic => {
    const pages = await new PdfService().extract(pdfFixture([
      { graphic }, { text: 'Acme Q2 2026. Active users 100. Detailed business review.' },
    ]));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.extractionStatus).toBe('visual_review_required');
    expect(pages[1]!.page).toBe(2);
  });
  it('accepts a document containing only short extractable text', async () => {
    const pages = await new PdfService().extract(pdfFixture([{ text: 'Acme Q2 2026' }]));
    expect(pages[0]!.text).toBe('Acme Q2 2026');
  });
  it('rejects an image-only document as requiring OCR', async () => {
    await expect(new PdfService().extract(pdfFixture([{ graphic: 'image' }]))).rejects.toMatchObject({ code: 'OCR_REQUIRED' });
  });
  it('rejects an entirely blank document without calling it a scan', async () => {
    await expect(new PdfService().extract(pdfFixture([{}, {}]))).rejects.toMatchObject({ code: 'NO_EXTRACTABLE_TEXT' });
  });
});
