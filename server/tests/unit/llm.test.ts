import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { DeepSeekProvider } from '../../src/providers/llm.provider.js';
import { fixture, sourceText } from '../fixtures/qbr.js';

const originalKey = env.DEEPSEEK_API_KEY;
beforeEach(() => { env.DEEPSEEK_API_KEY = 'test-key-not-real'; });
afterEach(() => { env.DEEPSEEK_API_KEY = originalKey; vi.unstubAllGlobals(); });
describe('DeepSeek provider contract (mocked HTTP)', () => {
  it('sends JSON extraction instructions and validates the structured response', async () => {
    let payload: Record<string, unknown> | undefined;
    const mockFetch = vi.fn(async (_url: unknown, options: RequestInit | undefined) => {
      payload = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({
        id: 'test-completion', object: 'chat.completion', created: 1, model: 'deepseek-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(fixture()) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', mockFetch);
    const result = await new DeepSeekProvider().extract([{ page: 1, text: sourceText, extractionStatus: 'visual_review_required', extractionNote: 'INTERNAL_PARSER_NOTE' }], 'deepseek-flash');
    expect(result.data.customer.value).toBe('Acme');
    expect(result.inputTokens).toBe(10); expect(result.outputTokens).toBe(20);
    expect(payload?.response_format).toEqual({ type: 'json_object' });
    expect(payload?.temperature).toBe(0);
    expect(JSON.stringify(payload?.messages)).toContain('UNTRUSTED');
    expect(JSON.stringify(payload?.messages)).not.toContain('INTERNAL_PARSER_NOTE');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('classifies authentication errors as permanent and does not retry inside the SDK', async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid key', type: 'authentication_error' } }), { status: 401, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', mockFetch);
    await expect(new DeepSeekProvider().extract([{ page: 1, text: sourceText }], 'deepseek-flash')).rejects.toMatchObject({ code: 'MODEL_CONFIGURATION' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('does not make a request without an API key', async () => {
    env.DEEPSEEK_API_KEY = ''; const mockFetch = vi.fn(); vi.stubGlobal('fetch', mockFetch);
    await expect(new DeepSeekProvider().extract([], 'deepseek-flash')).rejects.toMatchObject({ code: 'API_KEY_MISSING' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('recovers neutral owner metadata in the same request and reports the adjustment', async () => {
    const output = fixture();
    Object.assign(output.actionItems.items[0]!.owner, { normalized: null, precision: 'unknown' });
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'recovery-test', object: 'chat.completion', created: 1, model: 'deepseek-flash',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', mockFetch);
    const result = await new DeepSeekProvider().extract([{ page: 1, text: sourceText }], 'deepseek-flash');
    expect(result.data).toEqual(fixture());
    expect(result.diagnostics?.schemaRecovered).toBe(true);
    expect(result.diagnostics?.structuralAdjustments).toHaveLength(2);
    expect(result.inputTokens).toBe(10);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a schema failure with meaningful extra data', async () => {
    const output = fixture();
    Object.assign(output.actionItems.items[0]!.owner, { normalized: '2026-07-01', precision: 'day' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'invalid-test', object: 'chat.completion', created: 1, model: 'deepseek-flash',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { headers: { 'content-type': 'application/json' } })));
    await expect(new DeepSeekProvider().extract([{ page: 1, text: sourceText }], 'deepseek-flash')).rejects.toMatchObject({ name: 'AI_NoObjectGeneratedError' });
  });
  it.each(['stop', 'length'])('handles missing-date metadata with finish reason %s without another model call', async finishReason => {
    const output = fixture();
    const expectedDate = { value: null, status: 'missing' as const, reason: 'No date stated.', evidence: [], normalized: null, precision: 'unknown' as const };
    output.actionItems.items[0]!.dueDate = { ...expectedDate };
    Reflect.deleteProperty(output.actionItems.items[0]!.dueDate, 'normalized');
    Reflect.deleteProperty(output.actionItems.items[0]!.dueDate, 'precision');
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'missing-date-test', object: 'chat.completion', created: 1, model: 'deepseek-flash',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: finishReason }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', mockFetch);
    const request = new DeepSeekProvider().extract([{ page: 1, text: sourceText }], 'deepseek-flash');
    if (finishReason === 'stop') {
      const result = await request;
      expect(result.data.actionItems.items[0]!.dueDate).toEqual(expectedDate);
      expect(result.diagnostics?.structuralAdjustments).toEqual([
        { path: 'actionItems.items[0].dueDate.normalized', code: 'ADDED_MISSING_DATE_METADATA' },
        { path: 'actionItems.items[0].dueDate.precision', code: 'ADDED_MISSING_DATE_METADATA' },
      ]);
    } else await expect(request).rejects.toMatchObject({ name: 'AI_NoObjectGeneratedError' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
