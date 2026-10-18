import type { ExtractionDiagnostics, Qbr } from '@qbr/contracts';
import { factSchema, qbrSchema } from '@qbr/contracts';

export type StructuralAdjustment = ExtractionDiagnostics['structuralAdjustments'][number];

/**
 * Normalize neutral date metadata only. On ordinary facts it is removed; on an
 * explicitly missing date it can be supplied when omitted. Business values,
 * evidence, statuses, and dates with any supplied content are never inferred.
 */
export function recoverNeutralDateMetadata(text: string): { data: Qbr; adjustments: StructuralAdjustment[] } | null {
  let input: unknown;
  try { input = JSON.parse(text); } catch { return null; }
  const adjustments: StructuralAdjustment[] = [];
  function visit(node: unknown, path: string) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((value, index) => visit(value, `${path}[${index}]`)); return; }
    const object = node as Record<string, unknown>;
    const date = /^actionItems\.items\[\d+\]\.dueDate$/.test(path);
    if (date && object.value === null && object.status === 'missing') {
      const base = factSchema.safeParse({ value: object.value, status: object.status, reason: object.reason, evidence: object.evidence });
      const neutralMetadata = (!Object.hasOwn(object, 'normalized') || object.normalized === null)
        && (!Object.hasOwn(object, 'precision') || object.precision === 'unknown');
      if (base.success && neutralMetadata) {
        for (const [key, neutral] of [['normalized', null], ['precision', 'unknown']] as const) {
          if (!Object.hasOwn(object, key)) {
            object[key] = neutral;
            adjustments.push({ path: `${path}.${key}`, code: 'ADDED_MISSING_DATE_METADATA' });
          }
        }
      }
    }
    if (!date && 'value' in object && 'status' in object && Array.isArray(object.evidence)) {
      for (const [key, neutral] of [['normalized', null], ['precision', 'unknown']] as const) {
        if (Object.hasOwn(object, key) && object[key] === neutral) {
          delete object[key];
          adjustments.push({ path: `${path}.${key}`, code: 'REMOVED_NEUTRAL_DATE_METADATA' });
        }
      }
    }
    for (const [key, value] of Object.entries(object)) visit(value, path ? `${path}.${key}` : key);
  }
  visit(input, '');
  if (!adjustments.length) return null;
  const result = qbrSchema.safeParse(input);
  return result.success ? { data: result.data, adjustments } : null;
}
