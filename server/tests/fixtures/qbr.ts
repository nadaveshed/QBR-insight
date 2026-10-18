import { type Fact, type Qbr } from '@qbr/contracts';

export const sourceText = 'Acme Q2 2026. Improved adoption. Increase usage. Goal achieved. Training delayed. Rollout at risk. Review usage. Team A. July 2026. Active users 100. Q2. All users.';
export function fact(value = 'Acme', quote = value): Fact {
  return { value, status: 'supported', reason: null, evidence: [{ page: 1, quote }] };
}
export function missing(): Fact { return { value: null, status: 'missing', reason: 'Not stated.', evidence: [] }; }
export function fixture(): Qbr {
  return {
    customer: fact(), reportingPeriod: fact('Q2 2026'), executiveSummary: fact('Improved adoption.'),
    goals: { status: 'supported', reason: null, items: [fact('Increase usage.')] },
    kpis: { status: 'supported', reason: null, items: [{ name: fact('Active users'), status: 'supported', reason: null, observations: [{ role: 'current', value: fact('100'), numericValue: 100, qualifier: 'exact', unit: 'users', period: fact('Q2'), scope: fact('All users') }] }] },
    achievements: { status: 'supported', reason: null, items: [fact('Goal achieved.')] },
    challenges: { status: 'supported', reason: null, items: [fact('Training delayed.')] },
    risks: { status: 'supported', reason: null, items: [fact('Rollout at risk.')] },
    actionItems: { status: 'supported', reason: null, items: [{ description: fact('Review usage.'), owner: fact('Team A'), dueDate: { ...fact('July 2026'), normalized: '2026-07', precision: 'month' } }] },
  };
}
