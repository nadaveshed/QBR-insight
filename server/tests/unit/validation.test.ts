import { describe, expect, it } from 'vitest';
import { qbrSchema } from '@qbr/contracts';
import { ValidationService, normalizeExplicitDate } from '../../src/services/validation.service.js';
import { fixture, fact, missing, sourceText } from '../fixtures/qbr.js';

const service = new ValidationService();
const pages = [{ page: 1, text: sourceText }];
describe('Extraction quality checks', () => {
  it('accepts a fully sourced fixture without mutating the input', () => {
    const input = fixture(); const before = JSON.stringify(input);
    expect(service.validate(input, pages).quality.needsReview).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('marks invented citations unverified and clears their numeric projection', () => {
    const input = fixture(); input.kpis.items[0]!.observations[0]!.value = fact('900');
    const { data, quality } = service.validate(input, pages);
    expect(data.kpis.items[0]!.observations[0]!.value.status).toBe('unverified');
    expect(data.kpis.items[0]!.observations[0]!.numericValue).toBeNull();
    expect(quality.issues.some(i => i.code === 'EVIDENCE_INVALID')).toBe(true);
  });
  it('requires the quote to exist on the cited page', () => {
    const input = fixture(); input.customer.evidence[0]!.page = 2;
    expect(service.validate(input, pages).data.customer.status).toBe('unverified');
  });
  it('tolerates whitespace changes but not changed numbers', () => {
    const input = fixture(); input.executiveSummary = fact('Improved adoption.', 'Improved\n adoption.');
    expect(service.validate(input, pages).data.executiveSummary.status).toBe('supported');
  });
  it('preserves a missing owner and surfaces it for review', () => {
    const input = fixture(); input.actionItems.items[0]!.owner = missing();
    const result = service.validate(input, pages);
    expect(result.data.actionItems.items[0]!.owner.value).toBeNull();
    expect(result.quality.issues.some(i => i.path.endsWith('.owner') && i.code === 'MISSING')).toBe(true);
    expect(result.quality.needsReview).toBe(true);
  });
  it('retains missing optional measurement context as information without blocking completion', () => {
    const input = fixture();
    input.kpis.items[0]!.observations[0]!.scope = missing();
    const result = service.validate(input, pages);
    expect(result.quality.needsReview).toBe(false);
    expect(result.quality.issues).toHaveLength(1);
    expect(result.quality.issues.every(i => i.severity === 'info')).toBe(true);
  });
  it('keeps a missing KPI measurement period actionable', () => {
    const input = fixture(); input.kpis.items[0]!.observations[0]!.period = missing();
    const result = service.validate(input, pages);
    expect(result.quality.needsReview).toBe(true);
    expect(result.quality.issues[0]?.severity).toBe('warning');
  });
  it('does not downgrade invalid scope evidence to informational', () => {
    const input = fixture(); input.kpis.items[0]!.observations[0]!.scope = fact('Invented scope');
    const result = service.validate(input, pages);
    expect(result.quality.needsReview).toBe(true);
    expect(result.quality.issues.find(i => i.code === 'EVIDENCE_INVALID')?.severity).toBe('error');
  });
  it('rejects an invented day for a month-only deadline', () => {
    const input = fixture(); input.actionItems.items[0]!.dueDate.normalized = '2026-07-01';
    const result = service.validate(input, pages);
    expect(result.data.actionItems.items[0]!.dueDate.normalized).toBeNull();
    expect(result.quality.issues.some(i => i.code === 'DATE_PRECISION')).toBe(true);
  });
  it('detects two exact values with matching period and scope', () => {
    const input = fixture(); const observation = structuredClone(input.kpis.items[0]!.observations[0]!);
    observation.value = fact('68%'); observation.numericValue = 68;
    input.kpis.items[0]!.observations[0]!.value = fact('64%');
    input.kpis.items[0]!.observations[0]!.numericValue = 64;
    input.kpis.items[0]!.observations.push(observation);
    const result = service.validate(input, [{ page: 1, text: `${sourceText} 64% 68%` }]);
    expect(result.data.kpis.items[0]!.status).toBe('conflicting');
  });
  it('does not call an approximate number and a nearby exact number a definite conflict', () => {
    const input = fixture(); const observation = structuredClone(input.kpis.items[0]!.observations[0]!);
    observation.value = fact('approximately 520'); observation.numericValue = 520; observation.qualifier = 'approximate';
    input.kpis.items[0]!.observations[0]!.value = fact('524'); input.kpis.items[0]!.observations[0]!.numericValue = 524;
    input.kpis.items[0]!.observations.push(observation);
    expect(service.validate(input, [{ page: 1, text: `${sourceText} approximately 520 524` }]).data.kpis.items[0]!.status).toBe('supported');
  });
  it('clears a numeric projection that disagrees with the source value', () => {
    const input = fixture(); input.kpis.items[0]!.observations[0]!.numericValue = 999;
    expect(service.validate(input, pages).data.kpis.items[0]!.observations[0]!.numericValue).toBeNull();
  });
  it('rejects unknown fields and incomplete schemas', () => {
    expect(qbrSchema.safeParse({ ...fixture(), inventedField: true }).success).toBe(false);
    expect(qbrSchema.safeParse({ customer: fact() }).success).toBe(false);
  });
  it('marks a quarter/year assembled from a standalone date and separate objective as ambiguous', () => {
    const input = fixture(); input.reportingPeriod = fact('Q2 2026');
    input.reportingPeriod.evidence = [{ page: 1, quote: 'June 30, 2026' }, { page: 1, quote: 'Original target for Q2' }];
    const result = service.validate(input, [{ page: 1, text: `${sourceText} June 30, 2026. Original target for Q2.` }]);
    expect(result.data.reportingPeriod.status).toBe('ambiguous');
    expect(result.data.reportingPeriod.value).toBeNull();
    expect(result.quality.issues.some(i => i.code === 'PERIOD_INFERRED' && i.severity === 'warning')).toBe(true);
  });
  it.each(['Q2 2026', '2026 Q2', 'Q2 of 2026', 'Q2 FY2026'])('preserves explicitly linked period evidence: %s', quote => {
    const input = fixture(); input.reportingPeriod = fact('Q2 2026', quote);
    expect(service.validate(input, [{ page: 1, text: `${sourceText} ${quote}` }]).data.reportingPeriod.status).toBe('supported');
  });
  it('does not mark a supported word-based approximate KPI as an extraction error', () => {
    const input = fixture(); const observation = input.kpis.items[0]!.observations[0]!;
    observation.value = fact('around seventy percent'); observation.numericValue = 70; observation.qualifier = 'approximate';
    const result = service.validate(input, [{ page: 1, text: `${sourceText} around seventy percent` }]);
    expect(result.data.kpis.items[0]!.observations[0]!.numericValue).toBeNull();
    expect(result.data.kpis.items[0]!.observations[0]!.value.value).toBe('around seventy percent');
    expect(result.quality.issues).toContainEqual(expect.objectContaining({ code: 'NUMERIC_NOT_PROJECTED', severity: 'info' }));
    expect(result.quality.needsReview).toBe(false);
  });
  it.each(['TBD', 'Not recorded'])('normalizes the explicit absence marker %s without an error', marker => {
    const input = fixture(); input.actionItems.items[0]!.owner = { ...fact(marker), status: 'missing', reason: 'Not assigned.' };
    const result = service.validate(input, [{ page: 1, text: `${sourceText} ${marker}` }]);
    expect(result.data.actionItems.items[0]!.owner.value).toBeNull();
    expect(result.quality.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_MARKER_NORMALIZED', severity: 'info' }));
    expect(result.quality.issues.some(i => i.severity === 'error')).toBe(false);
    expect(result.quality.needsReview).toBe(true); // Missing ownership remains actionable.
  });
  it('retains missing-with-value errors for meaningful discarded values', () => {
    const input = fixture(); input.actionItems.items[0]!.owner.status = 'missing';
    expect(service.validate(input, pages).quality.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_WITH_VALUE', severity: 'error' }));
  });
  it('does not treat the m in minutes as a million multiplier', () => {
    const input = fixture(); const observation = input.kpis.items[0]!.observations[0]!;
    observation.value = fact('42 minutes'); observation.numericValue = 42;
    expect(service.validate(input, [{ page: 1, text: `${sourceText} 42 minutes` }]).data.kpis.items[0]!.observations[0]!.numericValue).toBe(42);
  });
  it('retains sparse visual pages as an actionable completeness warning', () => {
    const result = service.validate(fixture(), [...pages, { page: 2, text: '', extractionStatus: 'visual_review_required', extractionNote: 'Image content not interpreted.' }]);
    expect(result.quality.needsReview).toBe(true);
    expect(result.quality.issues).toContainEqual(expect.objectContaining({ code: 'PAGE_VISUAL_REVIEW', severity: 'warning' }));
  });
  it('does not create review findings for genuinely blank pages', () => {
    expect(service.validate(fixture(), [...pages, { page: 2, text: '', extractionStatus: 'blank' }]).quality.needsReview).toBe(false);
  });
});
describe('Date normalization', () => {
  it.each([
    ['15 July 2026', '2026-07-15', 'day'], ['July 15, 2026', '2026-07-15', 'day'],
    ['July 2026', '2026-07', 'month'], ['Q3 2026', '2026-Q3', 'quarter'],
    ['2026-08-10', '2026-08-10', 'day'],
  ])('normalizes only explicit dates: %s', (raw, value, precision) => expect(normalizeExplicitDate(raw)).toEqual({ value, precision }));
  it.each(['01/08/26', '22 July', 'TBD', 'August 5', '2026-02-30', '2026-13-01'])('leaves %s unresolved', raw => expect(normalizeExplicitDate(raw)).toBeNull());
});
