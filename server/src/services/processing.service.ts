import { performance } from 'node:perf_hooks';
import { ExtractionsRepository } from '../repositories/extractions.repository.js';
import type { StorageProvider } from '../providers/storage.provider.js';
import { PdfService } from './pdf.service.js';
import { ExtractionService } from './extraction.service.js';
import { ValidationService } from './validation.service.js';

export class ProcessingService {
  constructor(
    private readonly repository: ExtractionsRepository,
    private readonly storage: StorageProvider,
    private readonly pdf: PdfService,
    private readonly extraction: ExtractionService,
    private readonly validation: ValidationService,
  ) {}
  async process(runId: string) {
    const run = await this.repository.load(runId);
    if (!run || ['completed', 'needs_review'].includes(run.status)) return;
    const start = performance.now();
    await this.repository.start(runId);
    const pages = await this.pdf.extract(await this.storage.get(run.storage_key));
    await this.repository.savePages(runId, pages);
    const output = await this.extraction.extract(pages, run.model);
    // Structured model output still needs source checks before it becomes a saved business record.
    const { data, quality } = this.validation.validate(output.data, pages);
    if (output.diagnostics) quality.extraction = output.diagnostics;
    await this.repository.complete(runId, data, quality, Math.round(performance.now() - start), output.inputTokens, output.outputTokens);
  }
}
