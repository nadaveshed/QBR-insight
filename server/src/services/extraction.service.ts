import type { SourcePage } from '@qbr/contracts';
import type { LlmProvider } from '../providers/llm.provider.js';
export class ExtractionService {
  constructor(private readonly provider: LlmProvider) {}
  extract(pages: SourcePage[], model: string) { return this.provider.extract(pages, model); }
}
