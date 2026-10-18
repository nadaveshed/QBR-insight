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
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="/"><span className="brand-icon">q.</span>QBR <span className="brand-light">Insight</span></a><span className="header-note">BUSINESS REVIEWS, MADE USEFUL.</span><span className="workspace-label"><span className="status-dot" />Local workspace</span></header>
    <main><div className="page-intro"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h1>From reports to clarity.</h1><p>Structured insights. Traceable facts. A clearer next quarter.</p></div><span className="intro-mark" aria-hidden="true">↗</span></div>
      {aiConfigured === false && <div className="notice" role="status">AI processing is not configured yet. Set the DeepSeek API key on the server and restart the API and worker.</div>}
      <UploadPanel onUploaded={id => { setSelectedId(id); setSearch(''); setOffset(0); setRefresh(n => n + 1); }} />
      {error && <div className="notice danger" role="alert">{error}<button onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
      <div className="workspace-grid"><aside className="library"><div className="library-heading"><h2>Report library</h2><span>{documents.length}{documents.length === 50 ? '+' : ''}</span></div><label className="search-label"><span className="sr-only">Search reports</span><input value={search} placeholder="Search customer or period…" onChange={e => { setSearch(e.target.value); setOffset(0); }} /></label>
        {loading && <p className="library-placeholder">Loading reports…</p>}
        {!loading && documents.length === 0 && <p className="library-placeholder">{search ? 'No matching reports.' : 'Your uploaded reports will appear here.'}</p>}
        <div className="document-list">{documents.map(doc => <button key={doc.id} aria-pressed={selectedId === doc.id} className={`document-item ${selectedId === doc.id ? 'selected' : ''}`} onClick={() => setSelectedId(doc.id)}><div className="document-top"><span className="pdf-label">PDF</span><StatusBadge status={doc.status} /></div><strong>{doc.customer ?? doc.filename}</strong><span className="document-period">{doc.reportingPeriod ?? 'Period pending review'}</span><div className="document-bottom"><span>{new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>{doc.issueCount ? `${doc.issueCount} checks to review` : 'Open report ↗'}</span></div></button>)}</div>
        <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</button><button disabled={documents.length < 50} onClick={() => setOffset(n => n + 50)}>Next</button></div>
      </aside><div className="detail-panel">{selected ? <ReportDetail key={selected.id} document={selected} onRetry={async () => { await documentsApi.retry(selected.id); setRefresh(n => n + 1); }} /> : <div className="empty-detail"><span className="empty-icon" aria-hidden="true">▤</span><p className="eyebrow">YOUR REVIEW, IN FOCUS</p><h2>{selectedId ? 'Opening your report…' : 'Every detail has a source.'}</h2><p>{selectedId ? 'Retrieving the latest processing result.' : 'Upload a report or select one from the library to explore its metrics, actions and supporting evidence.'}</p><div className="empty-pills"><span>Metrics</span><span>Actions</span><span>Source evidence</span></div></div>}</div></div>
    </main><footer><span>QBR Insight</span><span>Review the evidence before acting on extracted information.</span></footer>
  </div>;
}
