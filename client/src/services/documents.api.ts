import type { DocumentDetail, DocumentSummary } from '@qbr/contracts';
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
export const documentsApi = {
  list: (search = '', offset = 0, signal?: AbortSignal) => request<{ items: DocumentSummary[] }>(`/documents?search=${encodeURIComponent(search)}&limit=50&offset=${offset}`, { signal }),
  get: (id: string, signal?: AbortSignal) => request<DocumentDetail>(`/documents/${id}`, { signal }),
  upload: (file: File) => {
    const body = new FormData(); body.append('file', file);
    return request<{ documentId: string; runId: string }>('/documents', { method: 'POST', body });
  },
  retry: (id: string) => request(`/documents/${id}/retry`, { method: 'POST' }),
  readiness: () => request<{ database: boolean; queue: boolean; aiConfigured: boolean }>('/ready'),
};
