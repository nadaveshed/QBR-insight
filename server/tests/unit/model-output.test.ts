import { describe, expect, it } from 'vitest';
import { fixture } from '../fixtures/qbr.js';
import { recoverNeutralDateMetadata } from '../../src/util/model-output.js';

describe('Lossless model-output recovery', () => {
  it('recovers the observed Apex error without changing the owner or deadline', () => {
    const input = fixture();
    const owner = input.actionItems.items[0]!.owner;
    Object.assign(owner, { normalized: null, precision: 'unknown' });
    const result = recoverNeutralDateMetadata(JSON.stringify(input));
    expect(result?.data).toEqual(fixture());
    expect(result?.adjustments).toEqual([
      { path: 'actionItems.items[0].owner.normalized', code: 'REMOVED_NEUTRAL_DATE_METADATA' },
      { path: 'actionItems.items[0].owner.precision', code: 'REMOVED_NEUTRAL_DATE_METADATA' },
    ]);
  });
  it('refuses to discard date metadata containing a value on an owner', () => {
    const input = fixture();
    Object.assign(input.actionItems.items[0]!.owner, { normalized: '2026-07-01', precision: 'day' });
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
  it('does not remove valid date metadata or patch missing required fields', () => {
    expect(recoverNeutralDateMetadata(JSON.stringify(fixture()))).toBeNull();
    const input = fixture();
    Object.assign(input.customer, { normalized: null });
    Reflect.deleteProperty(input.actionItems.items[0]!.dueDate, 'normalized');
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
  it('does not accept another schema error after removing neutral metadata', () => {
    const input = fixture();
    Object.assign(input.customer, { normalized: null, injected: 'unexpected' });
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
  it('rejects truncated and invalid JSON', () => {
    expect(recoverNeutralDateMetadata('{"customer":')).toBeNull();
  });
  it.each([['normalized'], ['precision'], ['normalized', 'precision']])('supplies only omitted metadata on an explicitly missing date: %j', (...keys) => {
    const input = fixture();
    input.actionItems.items[0]!.dueDate = { value: null, status: 'missing', reason: 'No date stated.', evidence: [], normalized: null, precision: 'unknown' };
    const expected = structuredClone(input);
    for (const key of keys) Reflect.deleteProperty(input.actionItems.items[0]!.dueDate, key);
    const result = recoverNeutralDateMetadata(JSON.stringify(input));
    expect(result?.data).toEqual(expected);
    expect(result?.adjustments).toHaveLength(keys.length);
    expect(result?.adjustments.every(a => a.code === 'ADDED_MISSING_DATE_METADATA')).toBe(true);
  });
  it.each(['supported', 'ambiguous', 'conflicting', 'unverified'])('does not complete metadata for a date marked %s', status => {
    const input = fixture();
    Object.assign(input.actionItems.items[0]!.dueDate, { value: null, status });
    Reflect.deleteProperty(input.actionItems.items[0]!.dueDate, 'normalized');
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
  it('does not complete metadata when a missing date contains a date value', () => {
    const input = fixture(); input.actionItems.items[0]!.dueDate.status = 'missing';
    Reflect.deleteProperty(input.actionItems.items[0]!.dueDate, 'normalized');
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
  it.each([{ normalized: '2026-07-01' }, { precision: 'day' }, { precision: null }])('does not override contradictory supplied metadata: %j', metadata => {
    const input = fixture();
    const date = { value: null, status: 'missing', reason: 'Not stated.', evidence: [], ...metadata };
    Object.assign(input.actionItems.items[0]!, { dueDate: date });
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
  it('still rejects missing evidence and missing date objects', () => {
    const input = fixture();
    Object.assign(input.actionItems.items[0]!, { dueDate: { value: null, status: 'missing', reason: 'Not stated.' } });
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
    Reflect.deleteProperty(input.actionItems.items[0]!, 'dueDate');
    expect(recoverNeutralDateMetadata(JSON.stringify(input))).toBeNull();
  });
});
