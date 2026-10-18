import { useEffect, useState } from 'react';
import type { DocumentDetail, DocumentSummary } from '@qbr/contracts';
import { documentsApi } from '../services/documents.api';
import { UploadPanel } from '../components/UploadPanel';
import { ReportDetail } from '../components/ReportDetail';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<DocumentDetail | null>(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const result = await documentsApi.list(search, offset, controller.signal);
        setDocuments(result.items); setError(''); setLoading(false);
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Could not load reports.'); setLoading(false); } }
      finally { fetching = false; }
    }
    const debounce = setTimeout(() => void load(), 200);
    const interval = setInterval(() => void load(), 4000);
    return () => { controller.abort(); clearTimeout(debounce); clearInterval(interval); };
  }, [search, offset, refresh]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController(); let fetching = false;
    setSelected(null);
    async function load() {
      if (fetching) return;
      fetching = true;
      try { setSelected(await documentsApi.get(selectedId!, controller.signal)); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load report.'); }
      finally { fetching = false; }
    }
    void load(); const interval = setInterval(() => void load(), 3000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [selectedId, refresh]);
  useEffect(() => { let active = true; void documentsApi.readiness().then(r => { if (active) setAiConfigured(r.aiConfigured); }).catch(() => {}); return () => { active = false; }; }, [refresh]);
  const count = (...statuses: string[]) => documents.filter(d => statuses.includes(d.status)).length;
  const stats = [
    { label: 'Reports', value: documents.length, tone: 'neutral' },
    { label: 'Completed', value: count('completed'), tone: 'success' },
    { label: 'Needs review', value: count('needs_review'), tone: 'warning' },
    { label: 'Processing', value: count('pending', 'queued', 'processing'), tone: 'info' },
    { label: 'Failed', value: count('failed'), tone: 'danger' },
  ];
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="/"><span className="brand-icon" aria-hidden="true">Q</span>QBR Insight</a><span className="workspace-label"><span className={`status-dot ${aiConfigured === false ? 'off' : ''}`} />{aiConfigured === false ? 'AI not configured' : 'Local workspace'}</span></header>
    <main>
      <div className="page-intro"><h1>QBR reports</h1><p>Structured data extracted from quarterly business review PDFs, with a source for every value.</p></div>
      <div className="stats" aria-label="Report status summary">{stats.map(s => <div key={s.label} className={`stat stat-${s.tone}`}><span className="stat-value">{s.value}</span><span className="stat-label">{s.label}</span></div>)}</div>
      {aiConfigured === false && <div className="notice" role="status">AI processing is not configured yet. Set the DeepSeek API key on the server and restart the API and worker.</div>}
      {error && <div className="notice danger" role="alert">{error}<button onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
      <div className="workspace-grid"><aside className="library">
        <UploadPanel onUploaded={id => { setSelectedId(id); setSearch(''); setOffset(0); setRefresh(n => n + 1); }} />
        <div className="library-heading"><h2>Reports</h2><span>{documents.length}{documents.length === 50 ? '+' : ''}</span></div><label className="search-label"><span className="sr-only">Search reports</span><input type="search" value={search} placeholder="Search customer or period…" onChange={e => { setSearch(e.target.value); setOffset(0); }} /></label>
        {loading && <p className="library-placeholder">Loading reports…</p>}
        {!loading && documents.length === 0 && <p className="library-placeholder">{search ? 'No matching reports.' : 'Your uploaded reports will appear here.'}</p>}
        <div className="document-list">{documents.map(doc => <button key={doc.id} aria-pressed={selectedId === doc.id} className={`document-item ${selectedId === doc.id ? 'selected' : ''}`} onClick={() => setSelectedId(doc.id)}><div className="document-top"><span className="pdf-label">PDF</span><StatusBadge status={doc.status} /></div><strong>{doc.customer ?? doc.filename}</strong><span className="document-period">{doc.reportingPeriod ?? 'Period not established'}</span><div className="document-bottom"><span>{new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>{doc.issueCount > 0 && <span className="issue-count">{doc.issueCount} to review</span>}</div></button>)}</div>
        {(offset > 0 || documents.length >= 50) && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</button><button disabled={documents.length < 50} onClick={() => setOffset(n => n + 50)}>Next</button></div>}
      </aside><div className="detail-panel">{selected ? <ReportDetail key={selected.id} document={selected} onRetry={async () => { await documentsApi.retry(selected.id); setRefresh(n => n + 1); }} /> : <div className="empty-detail"><span className="empty-icon" aria-hidden="true">▤</span><h2>{selectedId ? 'Opening report…' : 'No report selected'}</h2><p>{selectedId ? 'Retrieving the latest processing result.' : 'Upload a PDF or select a report to see its summary, KPIs, action items and source evidence.'}</p></div>}</div></div>
    </main><footer><span>QBR Insight · local proof of concept</span><span>Check the source before acting on extracted information.</span></footer>
  </div>;
}
