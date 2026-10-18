import type { Fact } from '@qbr/contracts';
import { StatusBadge } from './StatusBadge';
export function FactView({ fact, compact = false }: { fact: Fact; compact?: boolean }) {
  return <div className={compact ? 'fact compact' : 'fact'}>
    <div className="fact-value">{fact.value ?? <span className="muted">Not established</span>}{fact.status !== 'supported' && <StatusBadge status={fact.status} />}</div>
    {fact.reason && <p className="fact-reason">{fact.reason}</p>}
    {fact.evidence.length > 0 && <details className="evidence"><summary>{fact.evidence.length === 1 ? 'View source' : `View ${fact.evidence.length} sources`}</summary>
      {fact.evidence.map((e, i) => <blockquote key={i}><span>Page {e.page}</span>{e.quote}</blockquote>)}
    </details>}
  </div>;
}
