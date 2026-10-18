import { useState } from 'react';
import type { DocumentDetail, Qbr } from '@qbr/contracts';
import { FactView } from './FactView';
import { StatusBadge } from './StatusBadge';
const sectionNames = { goals: 'Period objectives', achievements: 'Key achievements', challenges: 'Challenges & gaps', risks: 'Risks & dependencies' } as const;

export function ReportDetail({ document, onRetry }: { document: DocumentDetail; onRetry: () => Promise<void> }) {
  const [tab, setTab] = useState('overview');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const result = document.result;
  const reviewIssues = document.quality?.issues.filter(issue => issue.severity !== 'info') ?? [];
  const information = document.quality?.issues.filter(issue => issue.severity === 'info') ?? [];
  async function retry() {
    setRetrying(true); setRetryError('');
    try { await onRetry(); } catch (e) { setRetryError(e instanceof Error ? e.message : 'Retry failed.'); }
    finally { setRetrying(false); }
  }
  return <article className="report-detail">
    <div className="report-heading"><div><p className="eyebrow">REPORT WORKSPACE</p><h2>{document.customer ?? document.filename}</h2><p className="muted filename">{document.filename}</p></div><StatusBadge status={document.status} /></div>
    <div className="report-meta"><span>{document.reportingPeriod ?? 'Period not established'}</span><a href={`/api/documents/${document.id}/export`} download>Export JSON ↗</a></div>
    {document.error && <div className="notice danger" role="alert"><strong>Processing needs attention</strong><p>{document.error}</p></div>}
    {document.status === 'failed' && <button disabled={retrying} onClick={() => void retry()}>{retrying ? 'Submitting…' : 'Retry processing'}</button>}
    {retryError && <p role="alert" className="error">{retryError}</p>}
    {!result && document.status !== 'failed' && <div className="processing-state"><span className="spinner" /><h3>Building a structured review</h3><p>The report is {document.status}. This view updates automatically.</p></div>}
    {result && <>
      <nav className="tabs" aria-label="Report sections">{['overview', 'metrics', 'actions', 'quality', 'source'].map(t => <button key={t} aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}{t === 'quality' && document.issueCount > 0 && <span className="tab-count">{document.issueCount}</span>}</button>)}</nav>
      {tab === 'overview' && <div className="tab-content">
        <section className="summary-card"><h3>Executive summary</h3><FactView fact={result.executiveSummary} /></section>
        <div className="identity-grid"><section><h3>Customer / unit</h3><FactView fact={result.customer} /></section><section><h3>Reporting period</h3><FactView fact={result.reportingPeriod} /></section></div>
        {(Object.keys(sectionNames) as (keyof typeof sectionNames)[]).map(key => <FactSection key={key} name={sectionNames[key]} section={result[key]} />)}
      </div>}
      {tab === 'metrics' && <div className="tab-content"><p className="section-intro">Original values, measurement scope and comparison periods stay together.</p>{result.kpis.items.length === 0 && <p className="muted">No metrics established. {result.kpis.reason}</p>}{result.kpis.items.map((kpi, i) => <section className="metric-card" key={i}><div className="metric-heading"><FactView fact={kpi.name} compact /><StatusBadge status={kpi.status} /></div>{kpi.reason && <p className="fact-reason">{kpi.reason}</p>}<div className="table-scroll"><table><thead><tr><th>Role</th><th>Reported value</th><th>Unit / qualifier</th><th>Period</th><th>Scope</th></tr></thead><tbody>{kpi.observations.map((o, j) => <tr key={j}><td><span className="role-label">{o.role}</span></td><td><FactView fact={o.value} compact />{o.numericValue !== null && <small className="muted">Numeric: {o.numericValue.toLocaleString('en-US')}</small>}</td><td>{o.unit ?? 'Unspecified'}<small>{o.qualifier.replaceAll('_', ' ')}</small></td><td><FactView fact={o.period} compact /></td><td><FactView fact={o.scope} compact /></td></tr>)}</tbody></table></div></section>)}</div>}
      {tab === 'actions' && <div className="tab-content"><p className="section-intro">Follow-up work with the ownership and timing actually stated in the report.</p>{!result.actionItems.items.length && <p className="muted">No follow-up actions established. {result.actionItems.reason}</p>}{result.actionItems.items.map((action, i) => <section className="action-card" key={i}><div className="action-number">{String(i + 1).padStart(2, '0')}</div><div className="action-body"><FactView fact={action.description} /><div className="action-fields"><div><h4>OWNER</h4><FactView fact={action.owner} compact /></div><div><h4>TARGET DATE</h4><FactView fact={action.dueDate} compact />{action.dueDate.normalized && <small className="muted">{action.dueDate.normalized} · {action.dueDate.precision} precision</small>}</div></div></div></section>)}</div>}
      {tab === 'quality' && <div className="tab-content"><p className="section-intro">Source checks and extraction issues. A verified quote supports traceability; it does not prove that every interpretation is correct.</p>{reviewIssues.length === 0 && <div className="notice success">No items require review under the configured checks.</div>}{reviewIssues.map((issue, i) => <div className={`quality-item severity-${issue.severity ?? 'warning'}`} key={i}><span className="issue-code">{issue.severity ?? 'warning'} · {issue.code.replaceAll('_', ' ')}</span><p>{issue.message}</p><code>{issue.path}</code></div>)}{information.length > 0 && <details className="information-notes"><summary>{information.length} informational notes — do not require review</summary>{information.map((issue, i) => <div className="quality-item severity-info" key={i}><span className="issue-code">Information · {issue.code.replaceAll('_', ' ')}</span><p>{issue.message}</p><code>{issue.path}</code></div>)}</details>}<div className="run-meta"><h3>Processing record</h3><dl><dt>Model</dt><dd>{document.model}</dd><dt>Schema / prompt version</dt><dd>{document.version}</dd><dt>Duration</dt><dd>{document.durationMs === null ? '—' : `${(document.durationMs / 1000).toFixed(1)}s`}</dd><dt>Tokens in / out</dt><dd>{document.inputTokens ?? '—'} / {document.outputTokens ?? '—'}</dd><dt>Attempts</dt><dd>{document.attempts}</dd></dl></div></div>}
      {tab === 'source' && <div className="tab-content">{document.pages.map(page => <section className="source-page" key={page.page}><h3>Page {page.page}</h3>{page.extractionStatus === "visual_review_required" && <div className="notice">{page.extractionNote}</div>}{page.extractionStatus === "blank" && <p className="muted">Blank page retained for source numbering.</p>}<pre>{page.text || "No extractable text on this page."}</pre></section>)}</div>}
    </>}
  </article>;
}
function FactSection({ name, section }: { name: string; section: Qbr['goals'] }) {
  return <section className="fact-section"><div className="section-heading"><h3>{name}</h3>{section.status !== 'supported' && <StatusBadge status={section.status} />}</div>{section.reason && <p className="fact-reason">{section.reason}</p>}{section.items.length ? <ul>{section.items.map((fact, i) => <li key={i}><FactView fact={fact} /></li>)}</ul> : <p className="muted">Not established in this report.</p>}</section>;
}
