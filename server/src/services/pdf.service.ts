import { PDFParse } from 'pdf-parse';
import type { SourcePage } from '@qbr/contracts';
import { env } from '../config/env.js';
import { PermanentProcessingError } from '../errors/app.error.js';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export class PdfService {
  async extract(data: Buffer): Promise<SourcePage[]> {
    const parser = new PDFParse({ data });
    try {
      const info = await parser.getInfo();
      if (info.total > env.MAX_DOCUMENT_PAGES) throw new PermanentProcessingError('DOCUMENT_TOO_LARGE', 'Document exceeds the configured page limit.');
      const result = await parser.getText({ cellSeparator: ' | ' });
      const pages: SourcePage[] = result.pages.map(p => ({ page: p.num, text: p.text.trim(), extractionStatus: 'text' }));
      if (pages.reduce((sum, p) => sum + p.text.length, 0) > env.MAX_DOCUMENT_CHARS) {
        throw new PermanentProcessingError('DOCUMENT_TOO_LARGE', 'Document exceeds the configured text limit. Content was not truncated.');
      }
      const sparse = pages.filter(p => p.text.replace(/\s/g, '').length < 30);
      if (sparse.length) {
        // Inspect only sparse pages. Character count is a routing hint, never
        // grounds for discarding a page or claiming that OCR is required.
        const task = getDocument({ data: new Uint8Array(data), isEvalSupported: false, verbosity: 0, useSystemFonts: true });
        try {
          const document = await task.promise;
          const visualOps = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.constructPath, OPS.shadingFill]);
          for (const source of sparse) {
            const page = await document.getPage(source.page);
            const operators = await page.getOperatorList();
            const annotations = await page.getAnnotations();
            if (operators.fnArray.some(op => visualOps.has(op)) || annotations.length > 0) {
              source.extractionStatus = 'visual_review_required';
              source.extractionNote = 'Sparse-text page contains graphical content or annotations. It may be a cover/logo, a scan, or a diagram; consult the original PDF because visual content was not interpreted.';
            } else if (!source.text) {
              source.extractionStatus = 'blank';
              source.extractionNote = 'No extractable text, graphical drawing operations or annotations were detected. Original page numbering is retained.';
            }
            page.cleanup();
          }
        } finally { await task.destroy(); }
      }
      if (!pages.some(p => p.text.replace(/\s/g, '').length > 0)) {
        if (pages.some(p => p.extractionStatus === 'visual_review_required')) throw new PermanentProcessingError('OCR_REQUIRED', 'The document has graphical content but no extractable text. OCR or visual review is required.');
        throw new PermanentProcessingError('NO_EXTRACTABLE_TEXT', 'The document contains no extractable text or detected graphical content.');
      }
      return pages;
    } catch (error) {
      if (error instanceof PermanentProcessingError) throw error;
      throw new PermanentProcessingError('PDF_UNREADABLE', 'The PDF could not be parsed. It may be damaged or password protected.');
    } finally { await parser.destroy(); }
  }
}
