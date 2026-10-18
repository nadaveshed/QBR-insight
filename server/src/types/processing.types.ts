import type { Qbr, ExtractionDiagnostics } from '@qbr/contracts';
export interface ProcessingJob { runId: string }
export interface ExtractionOutput {
  data: Qbr;
  inputTokens: number | null;
  outputTokens: number | null;
  diagnostics?: ExtractionDiagnostics;
}
