const labels: Record<string, string> = { needs_review: 'Needs review', supported: 'Supported', missing: 'Missing', conflicting: 'Conflict', ambiguous: 'Ambiguous', unverified: 'Unverified', pending: 'Pending', queued: 'Queued', processing: 'Processing', completed: 'Completed', failed: 'Failed' };
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{labels[status] ?? status}</span>;
}
