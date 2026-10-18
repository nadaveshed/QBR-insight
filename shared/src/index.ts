import { z } from 'zod';

export const EXTRACTION_VERSION = 'qbr-v4';
export const statusSchema = z.enum(['supported', 'missing', 'ambiguous', 'conflicting', 'unverified']);
export const evidenceSchema = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(1),
}).strict();
export const factSchema = z.object({
  value: z.string().nullable(),
  status: statusSchema,
  reason: z.string().nullable(),
  evidence: z.array(evidenceSchema),
}).strict();
export const dateSchema = factSchema.extend({
  normalized: z.string().nullable().describe('YYYY-MM-DD, YYYY-MM, or YYYY-Qn only when unambiguous'),
  precision: z.enum(['day', 'month', 'quarter', 'unknown']),
}).strict();
const factListSchema = z.object({
  status: statusSchema,
  reason: z.string().nullable(),
  items: z.array(factSchema),
}).strict();
const observationSchema = z.object({
  role: z.enum(['current', 'previous', 'target', 'other']),
  value: factSchema.describe('Original value including approximation or bounds'),
  numericValue: z.number().nullable(),
  qualifier: z.enum(['exact', 'approximate', 'greater_than', 'less_than', 'at_least', 'at_most', 'range', 'unknown']),
  unit: z.string().nullable(),
  period: factSchema,
  scope: factSchema.describe('Population, department, geography, or measurement scope'),
}).strict();
export const qbrSchema = z.object({
  customer: factSchema,
  reportingPeriod: factSchema,
  executiveSummary: factSchema,
  goals: factListSchema.describe('Goals set for the reporting period, not future priorities'),
  kpis: z.object({
    status: statusSchema,
    reason: z.string().nullable(),
    items: z.array(z.object({
      name: factSchema,
      status: statusSchema,
      reason: z.string().nullable(),
      observations: z.array(observationSchema).min(1),
    }).strict()),
  }).strict(),
  achievements: factListSchema,
  challenges: factListSchema,
  risks: factListSchema,
  actionItems: z.object({
    status: statusSchema,
    reason: z.string().nullable(),
    items: z.array(z.object({ description: factSchema, owner: factSchema, dueDate: dateSchema }).strict()),
  }).strict(),
}).strict();

export type Fact = z.infer<typeof factSchema>;
export type Qbr = z.infer<typeof qbrSchema>;
export type DateFact = z.infer<typeof dateSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export interface SourcePage {
  page: number; text: string;
  extractionStatus?: 'text' | 'blank' | 'visual_review_required';
  extractionNote?: string;
}
export type IssueSeverity = 'error' | 'warning' | 'info';
export interface ExtractionDiagnostics {
  schemaRecovered: boolean;
  structuralAdjustments: { path: string; code: 'REMOVED_NEUTRAL_DATE_METADATA' | 'ADDED_MISSING_DATE_METADATA' }[];
}
export interface QualityIssue { path: string; code: string; message: string; severity?: IssueSeverity }
export interface QualityResult { needsReview: boolean; issues: QualityIssue[]; extraction?: ExtractionDiagnostics }
export type RunStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'needs_review' | 'failed';
export interface DocumentSummary {
  id: string; filename: string; createdAt: string;
  runId: string; status: RunStatus; attempts: number;
  customer: string | null; reportingPeriod: string | null;
  issueCount: number; error: string | null;
}
export interface DocumentDetail extends DocumentSummary {
  result: Qbr | null; quality: QualityResult | null; pages: SourcePage[];
  model: string; version: string; durationMs: number | null;
  inputTokens: number | null; outputTokens: number | null;
}
