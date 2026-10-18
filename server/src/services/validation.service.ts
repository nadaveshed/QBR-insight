import { qbrSchema, type DateFact, type Fact, type IssueSeverity, type Qbr, type QualityIssue, type QualityResult, type SourcePage } from '@qbr/contracts';
import { hasUnlinkedQuarterYear } from '../util/reporting-period.js';

const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];

export function normalizeExplicitDate(raw: string): { value: string; precision: DateFact['precision'] } | null {
  const text = raw.toLowerCase().trim();
  let year: number, month: number, day: number | undefined;
  let match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(text);
  if (match) { year = Number(match[1]); month = Number(match[2]); day = match[3] ? Number(match[3]) : undefined; }
  else {
    const quarter = /^(?:q([1-4])\s+(\d{4})|(\d{4})\s+q([1-4]))$/.exec(text);
    if (quarter) return { value: `${quarter[2] ?? quarter[3]}-Q${quarter[1] ?? quarter[4]}`, precision: 'quarter' };
    match = /^(?:(\d{1,2})\s+)?([a-z]+)(?:\s+(\d{1,2}),?)?\s+(\d{4})$/.exec(text);
    if (!match || (match[1] && match[3])) return null;
    month = months.indexOf(match[2]!) + 1; year = Number(match[4]);
    day = match[1] || match[3] ? Number(match[1] ?? match[3]) : undefined;
  }
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  if (day === undefined) return { value: prefix, precision: 'month' };
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return { value: `${prefix}-${String(day).padStart(2, '0')}`, precision: 'day' };
}

export class ValidationService {
  validate(input: Qbr, pages: SourcePage[]): { data: Qbr; quality: QualityResult } {
    const data = qbrSchema.parse(input);
    const issues: QualityIssue[] = [];
    const add = (path: string, code: string, message: string, severity?: IssueSeverity) => {
      // Missing optional measurement context is retained, but does not block an
      // otherwise supported report. Invalid evidence/ambiguity always escalates.
      const optionalContext = /^kpis\.items\[\d+\]\.observations\[\d+\]\.scope$/.test(path);
      const level = severity ?? (code === 'MISSING' && optionalContext ? 'info' :
        ['EVIDENCE_INVALID', 'VALUE_MISSING', 'MISSING_WITH_VALUE', 'NUMERIC_UNVERIFIED', 'UNVERIFIED', 'EMPTY_SECTION'].includes(code) ? 'error' : 'warning');
      if (!issues.some(issue => issue.path === path && issue.code === code)) issues.push({ path, code, message, severity: level });
    };
    const source = new Map(pages.map(p => [p.page, normalize(p.text)]));
    function visit(node: unknown, path: string) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((item, i) => visit(item, `${path}[${i}]`)); return; }
      const obj = node as Record<string, unknown>;
      if ('evidence' in obj && 'value' in obj && 'status' in obj) {
        const fact = obj as unknown as Fact;
        const invalid = fact.evidence.some(e => !normalize(e.quote) || !source.get(e.page)?.includes(normalize(e.quote)));
        if (invalid || (fact.status === 'supported' && fact.evidence.length === 0)) {
          fact.status = 'unverified';
          fact.reason = 'Source evidence could not be verified against the extracted page text.';
          add(path, 'EVIDENCE_INVALID', fact.reason);
        }
        if (fact.status === 'supported' && (fact.value === null || !fact.value.trim())) {
          fact.status = 'unverified';
          add(path, 'VALUE_MISSING', 'A supported field must have a nonempty value.');
        }
        if (fact.status === 'missing' && fact.value !== null) {
          const explicitMarker = /^(?:tbd|tba|n\/?a|not (?:recorded|assigned|specified|provided|stated)|no (?:owner|date)(?: assigned)?(?: yet)?)\.?$/i.test(fact.value.trim());
          fact.value = null;
          add(path, explicitMarker ? 'MISSING_MARKER_NORMALIZED' : 'MISSING_WITH_VALUE',
            explicitMarker ? 'An explicit absence marker was normalized to null; source evidence is retained.' : 'Removed a value marked missing.', explicitMarker ? 'info' : 'error');
        }
        if (fact.status !== 'supported') add(path, fact.status.toUpperCase(), fact.reason ?? 'This field needs review.');
        if ('normalized' in obj) {
          const date = obj as unknown as DateFact;
          if (date.normalized !== null) {
            const explicit = date.value ? normalizeExplicitDate(date.value) : null;
            if (date.status !== 'supported' || explicit?.value !== date.normalized || explicit.precision !== date.precision) {
              date.normalized = null;
              date.precision = 'unknown';
              if (date.status === 'supported') date.status = 'ambiguous';
              add(path, 'DATE_PRECISION', 'Removed date normalization not justified by an explicit unambiguous source date.');
            }
          }
        }
        return;
      }
      if ('status' in obj && 'items' in obj && Array.isArray(obj.items)) {
        if (obj.status === 'supported' && obj.items.length === 0) {
          obj.status = 'unverified';
          add(path, 'EMPTY_SECTION', 'An empty section cannot be marked supported.');
        } else if (obj.status !== 'supported') add(path, String(obj.status).toUpperCase(), String(obj.reason ?? 'Section needs review.'));
      }
      for (const [key, value] of Object.entries(obj)) visit(value, path ? `${path}.${key}` : key);
    }
    visit(data, '');
    if (hasUnlinkedQuarterYear(data.reportingPeriod)) {
      const candidate = data.reportingPeriod.value;
      data.reportingPeriod.status = 'ambiguous';
      data.reportingPeriod.value = null;
      data.reportingPeriod.reason = `Candidate '${candidate}' combines a quarter and year that are not explicitly linked in its source evidence. A document/publication date does not establish the reporting year.`;
      add('reportingPeriod', 'PERIOD_INFERRED', data.reportingPeriod.reason, 'warning');
    }
    for (const page of pages) {
      if (page.extractionStatus === 'visual_review_required') add(`pages[${page.page}]`, 'PAGE_VISUAL_REVIEW', page.extractionNote ?? 'Graphical content on a sparse-text page was not interpreted. Consult the original PDF; the result may be incomplete.', 'warning');
    }
    for (const [index, metric] of data.kpis.items.entries()) {
      if (metric.status !== 'supported') add(`kpis.items[${index}]`, metric.status.toUpperCase(), metric.reason ?? 'Metric needs review.');
      const groups = new Map<string, number>();
      for (const [oi, observation] of metric.observations.entries()) {
        if (observation.numericValue !== null) {
          const numericText = observation.value.value?.replace(/,/g, '') ?? '';
          const match = /(-?\d+(?:\.\d+)?)(?:\s*([mk])\b)?/i.exec(numericText);
          const expected = match ? Number(match[1]) * (match[2]?.toLowerCase() === 'm' ? 1e6 : match[2]?.toLowerCase() === 'k' ? 1e3 : 1) : null;
          if (observation.value.status !== 'supported' || observation.qualifier === 'range' || /\d\s*\/\s*\d/.test(numericText) || expected === null || Math.abs(expected - observation.numericValue) > 1e-8) {
            observation.numericValue = null;
            const optionalProjection = observation.value.status === 'supported'
              && (expected === null || observation.qualifier === 'range' || /\d\s*\/\s*\d/.test(numericText));
            add(`kpis.items[${index}].observations[${oi}]`, optionalProjection ? 'NUMERIC_NOT_PROJECTED' : 'NUMERIC_UNVERIFIED',
              optionalProjection ? 'Original wording is retained; this representation has no verified numeric projection.' : 'Numeric value disagrees with the reported wording or lacks verified evidence.', optionalProjection ? 'info' : 'error');
          }
        }
        if (observation.role !== 'current' || observation.qualifier !== 'exact' || observation.numericValue === null) continue;
        if (observation.period.status !== 'supported' || observation.scope.status !== 'supported') continue;
        const key = normalize(`${observation.period.value}|${observation.scope.value}|${observation.unit}`).toLowerCase();
        const previous = groups.get(key);
        if (previous !== undefined && previous !== observation.numericValue) {
          metric.status = 'conflicting'; metric.reason = 'Different exact values were extracted for the same metric, period, scope and unit.';
          add(`kpis.items[${index}]`, 'CONFLICTING', metric.reason);
        }
        groups.set(key, observation.numericValue);
      }
    }
    return { data, quality: { needsReview: issues.some(issue => issue.severity !== 'info'), issues } };
  }
}
