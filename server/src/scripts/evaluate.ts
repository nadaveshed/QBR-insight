import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EXTRACTION_VERSION, qbrSchema, type Qbr } from '@qbr/contracts';
import { env, projectRoot } from '../config/env.js';
import { PdfService } from '../services/pdf.service.js';
import { DeepSeekProvider } from '../providers/llm.provider.js';
import { ValidationService } from '../services/validation.service.js';
import { NoObjectGeneratedError } from 'ai';

type Check = { name: string; passed: boolean };
const unavailableFact = { value: null, status: 'missing' as const, reason: 'Extraction failed.', evidence: [] };
const unavailableList = { status: 'missing' as const, reason: 'Extraction failed.', items: [] };
const unavailableQbr: Qbr = {
  customer: unavailableFact, reportingPeriod: unavailableFact, executiveSummary: unavailableFact,
  goals: unavailableList, kpis: unavailableList, achievements: unavailableList,
  challenges: unavailableList, risks: unavailableList, actionItems: unavailableList,
};
const cases = [
  { file: '01_Northwind_Technologies_Q2_2026.pdf', customer: 'Northwind Technologies', check: (q: Qbr): Check[] => [
    { name: 'Q2 2026 period established', passed: /q2.*2026|2026.*q2/i.test(q.reportingPeriod.value ?? '') && q.reportingPeriod.status === 'supported' },
    { name: 'Current MAU 875, previous 640', passed: q.kpis.items.some(k => k.observations.some(o => o.role === 'current' && o.numericValue === 875) && k.observations.some(o => o.role === 'previous' && o.numericValue === 640)) },
    { name: 'Sarah owns onboarding with precise deadline', passed: q.actionItems.items.some(a => /onboard/i.test(a.description.value ?? '') && /sarah levi/i.test(a.owner.value ?? '') && a.dueDate.normalized === '2026-07-15') },
    { name: 'Month-only deadline retains month precision', passed: q.actionItems.items.some(a => a.dueDate.normalized === '2026-07' && a.dueDate.precision === 'month') },
  ] },
  { file: '02_Globex_Retail_Apr-Jun_2026.pdf', customer: 'Globex Retail', check: (q: Qbr): Check[] => [
    { name: 'Reporting period distinguishes April-June from publication in July', passed: /q2|april.*june|apr.*jun|2026-04/i.test(q.reportingPeriod.value ?? '') && !/q3/i.test(q.reportingPeriod.value ?? '') },
    { name: 'Conflicting adoption values retained', passed: q.kpis.items.some(k => k.status === 'conflicting' && k.observations.some(o => /64/.test(o.value.value ?? '')) && k.observations.some(o => /68/.test(o.value.value ?? ''))) },
    { name: 'Ambiguous numeric date is not normalized', passed: q.actionItems.items.some(a => a.dueDate.value?.includes('01/08/26') && a.dueDate.normalized === null && a.dueDate.status !== 'supported') },
    { name: 'Unassigned training owner remains missing', passed: q.actionItems.items.some(a => /train/i.test(a.description.value ?? '') && a.owner.status === 'missing' && a.owner.value === null) },
  ] },
  { file: '03_Contoso_Manufacturing_QBR_Notes.pdf', customer: 'Contoso Manufacturing', check: (q: Qbr): Check[] => [
    { name: 'Meeting date is not invented reporting quarter', passed: q.reportingPeriod.status !== 'supported' && !/q2\s*2026|2026\s*q2/i.test(q.reportingPeriod.value ?? '') },
    { name: 'No retroactive goals fabricated from priorities', passed: q.goals.status !== 'supported' },
    { name: 'Tom owns ERP log review without a deadline', passed: q.actionItems.items.some(a => /tom/i.test(a.owner.value ?? '') && /log/i.test(a.description.value ?? '') && a.dueDate.normalized === null && a.dueDate.status === 'missing') },
  ] },
  { file: '04_BluePeak_Financial_Services_Business_Review.pdf', customer: 'BluePeak Financial Services', check: (q: Qbr): Check[] => [
    { name: 'Unstated year remains unresolved', passed: q.reportingPeriod.status !== 'supported' && !/20\d{2}/.test(q.reportingPeriod.value ?? '') },
    { name: 'Original failed execution goal found near end', passed: q.goals.items.some(g => /2\s*%/.test(g.value ?? '') && /fail/i.test(g.value ?? '')) },
    { name: 'Yearless dates are not normalized', passed: q.actionItems.items.every(a => a.dueDate.normalized === null) },
  ] },
  { file: '05_Apex_Healthcare_Account_Update.pdf', customer: 'Apex Healthcare', check: (q: Qbr): Check[] => [
    { name: '524 exact and approximately 520 retained', passed: q.kpis.items.some(k => k.observations.some(o => /524/.test(o.value.value ?? '')) && k.observations.some(o => /520/.test(o.value.value ?? '') && o.qualifier === 'approximate')) },
    { name: 'Original 700 active user target captured', passed: q.kpis.items.some(k => k.observations.some(o => o.role === 'target' && o.numericValue === 700)) },
    { name: 'Rebecca owns Hospital South rollout', passed: q.actionItems.items.some(a => /rebecca/i.test(a.owner.value ?? '') && /south/i.test(a.description.value ?? '')) },
  ] },
  { file: '06_Vertex_Logistics_Quarterly_Review.pdf', customer: 'Vertex Logistics', check: (q: Qbr): Check[] => [
    { name: 'Standalone document date does not establish a supported reporting year', passed: q.reportingPeriod.status !== 'supported' && !/q2\s*2026|2026\s*q2/i.test(q.reportingPeriod.value ?? '') },
    { name: 'June transaction metric keeps monthly scope', passed: q.kpis.items.some(k => k.observations.some(o => o.numericValue === 2400000 && /june|2026-06/i.test(o.period.value ?? ''))) },
    { name: 'Original weekly active target 900 captured', passed: q.kpis.items.some(k => k.observations.some(o => o.role === 'target' && o.numericValue === 900) && k.observations.some(o => o.role === 'current' && o.numericValue === 910)) },
    { name: 'TBD performance deadline stays missing', passed: q.actionItems.items.some(a => /performance/i.test(a.description.value ?? '') && a.dueDate.status === 'missing' && a.dueDate.normalized === null) },
    { name: 'Poland owner not recorded stays missing', passed: q.actionItems.items.some(a => /poland/i.test(a.description.value ?? '') && a.owner.status === 'missing') },
  ] },
];

const offlineIndex = process.argv.indexOf('--offline');
const offline = offlineIndex >= 0 ? process.argv[offlineIndex + 1] : undefined;
const fileIndex = process.argv.indexOf('--file');
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
if (fileIndex >= 0 && (!file || !cases.some(c => c.file === file))) throw new Error('Provide an exact sample PDF filename after --file.');
if (offlineIndex >= 0 && !offline) throw new Error('Provide a directory after --offline.');
if (!offline && !env.DEEPSEEK_API_KEY.trim()) {
  console.error('Set DEEPSEEK_API_KEY in server/.env to run live evaluation, or use --offline <directory> with saved QBR JSON files. No model calls were made.');
  process.exitCode = 1;
} else {
  const results = [];
  const directory = resolve(projectRoot, 'data/evaluations', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(directory, { recursive: true });
  for (const item of cases.filter(c => !file || c.file === file)) {
    try {
      const pages = await new PdfService().extract(await readFile(resolve(projectRoot, 'data/raw', item.file)));
      const output = offline
        ? { data: qbrSchema.parse(JSON.parse(await readFile(resolve(projectRoot, offline, `${item.file}.json`), 'utf8'))), inputTokens: null, outputTokens: null }
        : await new DeepSeekProvider().extract(pages, env.DEEPSEEK_MODEL);
      const checked = new ValidationService().validate(output.data, pages);
      if ('diagnostics' in output && output.diagnostics) checked.quality.extraction = output.diagnostics;
      const checks = [{ name: 'Correct customer', passed: checked.data.customer.value?.toLowerCase() === item.customer.toLowerCase() },
        { name: 'All source evidence verified', passed: !checked.quality.issues.some(i => i.code === 'EVIDENCE_INVALID') }, ...item.check(checked.data)];
      await writeFile(resolve(directory, `${item.file}.json`), JSON.stringify(checked.data, null, 2));
      await writeFile(resolve(directory, `${item.file}.quality.json`), JSON.stringify(checked.quality, null, 2));
      results.push({ file: item.file, checks, inputTokens: output.inputTokens, outputTokens: output.outputTokens, quality: checked.quality });
      console.log(`${item.file}: ${checks.filter(c => c.passed).length}/${checks.length}`);
    } catch (error) {
      const diagnostics: { type: string; issues?: unknown }[] = [];
      let cause: unknown = error;
      for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
        diagnostics.push({ type: cause.name, ...('issues' in cause ? { issues: cause.issues } : {}) });
        cause = cause.cause;
      }
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        await writeFile(resolve(directory, `${item.file}.failed-response.txt`), error.text);
      }
      const checks = [{ name: 'Correct customer', passed: false }, { name: 'All source evidence verified', passed: false },
        ...item.check(unavailableQbr).map(check => ({ ...check, passed: false }))];
      results.push({ file: item.file, checks, errorType: error instanceof Error ? error.name : 'unknown', diagnostics,
        ...(NoObjectGeneratedError.isInstance(error) ? { finishReason: error.finishReason, inputTokens: error.usage?.inputTokens, outputTokens: error.usage?.outputTokens } : {}),
      });
      console.error(`${item.file}: failed (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }
  const checks = results.flatMap(r => r.checks);
  const completed = results.filter(result => 'quality' in result);
  const recovered = completed.filter(result => result.quality?.extraction?.schemaRecovered).length;
  const summary = {
    model: env.DEEPSEEK_MODEL, extractionVersion: EXTRACTION_VERSION, mode: offline ? 'offline' : 'live',
    passed: checks.filter(c => c.passed).length, total: checks.length,
    documents: { total: results.length, completed: completed.length, failed: results.length - completed.length },
    schemaValidation: offline ? null : { strictSuccesses: completed.length - recovered, recoveredResponses: recovered, failedResponses: results.length - completed.length },
    results,
  };
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Evaluation: ${summary.passed}/${summary.total}. Results: ${directory}`);
  if (summary.passed < summary.total) process.exitCode = 1;
}
