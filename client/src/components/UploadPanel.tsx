import { useRef, useState } from 'react';
import { documentsApi } from '../services/documents.api';
export function UploadPanel({ onUploaded }: { onUploaded: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  async function upload(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true); setMessage('');
    let done = 0;
    try {
      for (const file of files) {
        if (!/\.pdf$/i.test(file.name)) throw new Error('Please select PDF files.');
        const result = await documentsApi.upload(file);
        done++; onUploaded(result.documentId);
      }
      setMessage(`${done} ${done === 1 ? 'document' : 'documents'} submitted for processing.`);
    } catch (error) { setMessage(`${done ? `${done} submitted. ` : ''}${error instanceof Error ? error.message : 'Upload failed.'}`); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <section className={`upload-panel ${dragging ? 'dragging' : ''}`} aria-label="Upload reports"
    onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
    onDrop={e => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}>
    <div className="upload-text"><h2>Upload reports</h2><p>Drag PDF files here, or</p></div>
    <input ref={input} type="file" accept=".pdf,application/pdf" multiple hidden onChange={e => void upload(Array.from(e.target.files ?? []))} />
    <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Choose PDFs'}</button>
    {message && <p className="upload-message" role="status">{message}</p>}
  </section>;
}
