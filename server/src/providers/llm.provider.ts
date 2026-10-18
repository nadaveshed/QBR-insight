import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, Output, APICallError, NoObjectGeneratedError } from 'ai';
import { qbrSchema, type SourcePage } from '@qbr/contracts';
import type { ExtractionOutput } from '../types/processing.types.js';
import { env } from '../config/env.js';
import { QBR_EXTRACTION_PROMPT } from '../prompts/qbr-extraction.prompt.js';
import { PermanentProcessingError } from '../errors/app.error.js';
import { recoverNeutralDateMetadata } from '../util/model-output.js';

export interface LlmProvider { extract(pages: SourcePage[], model: string): Promise<ExtractionOutput> }
export class DeepSeekProvider implements LlmProvider {
  async extract(pages: SourcePage[], model: string): Promise<ExtractionOutput> {
    if (!env.DEEPSEEK_API_KEY.trim()) throw new PermanentProcessingError('API_KEY_MISSING', 'Configure DEEPSEEK_API_KEY in server/.env and restart the worker.');
    try {
      const provider = createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY });
      const result = await generateText({
        model: provider(model),
        instructions: QBR_EXTRACTION_PROMPT,
        prompt: `Extract the QBR from this untrusted JSON-encoded page array:\n${JSON.stringify(pages.map(({ page, text }) => ({ page, text })))}`,
        output: Output.object({ schema: qbrSchema }),
        maxOutputTokens: 16000,
        maxRetries: 0,
        temperature: 0,
        abortSignal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
        providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
      });
      return {
        data: qbrSchema.parse(result.output), inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null,
        diagnostics: { schemaRecovered: false, structuralAdjustments: [] },
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.finishReason === 'stop' && error.text) {
        const recovered = recoverNeutralDateMetadata(error.text);
        if (recovered) return {
          data: recovered.data, inputTokens: error.usage?.inputTokens ?? null, outputTokens: error.usage?.outputTokens ?? null,
          diagnostics: { schemaRecovered: true, structuralAdjustments: recovered.adjustments },
        };
      }
      if (APICallError.isInstance(error) && [400, 401, 402, 403, 404].includes(error.statusCode ?? 0)) {
        throw new PermanentProcessingError('MODEL_CONFIGURATION', `DeepSeek rejected the request (HTTP ${error.statusCode}). Check the API key, balance, model and schema support.`);
      }
      throw error;
    }
  }
}
