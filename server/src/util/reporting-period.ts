import type { Fact } from '@qbr/contracts';

/** Conservative guard for a quarter/year assembled from separate citations. */
export function hasUnlinkedQuarterYear(period: Fact): boolean {
  if (period.status !== 'supported' || !period.value) return false;
  const quarter = /\bq\s*([1-4])\b/i.exec(period.value)?.[1];
  const year = /\b(20\d{2})\b/.exec(period.value)?.[1];
  if (!quarter || !year) return false;
  // Do not concatenate evidence or cross line breaks: a document date and a
  // separately cited Q2 objective do not establish the reporting year together.
  const linked = new RegExp(`\\bq[ \\t]*${quarter}[ \\t]*(?:[-/,][ \\t]*|of[ \\t]+|fy[ \\t]*)?${year}\\b|\\b${year}[ \\t]*(?:[-/,][ \\t]*)?q[ \\t]*${quarter}\\b`, 'i');
  return !period.evidence.some(e => linked.test(e.quote));
}
