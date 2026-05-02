import {
  ChatCompletionResponseSchema,
  ModelListResponseSchema,
  formatZodError,
} from './schemas.js';
import type { ChatRequest, LlmClientPort } from './types.js';
import { safeJsonFetch } from './security.js';

function extractContent(data: unknown): string {
  const parsed = ChatCompletionResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw formatZodError('Invalid LLM response', parsed.error);
  }
  // choices[0] may be undefined in TS even if Zod validates min(1)
  return parsed.data.choices[0]?.message.content ?? '';
}

function extractModelIds(data: unknown): string[] {
  const parsed = ModelListResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw formatZodError('Invalid LLM models response', parsed.error);
  }
  return parsed.data.data.map((m) => m.id);
}

export class OpenAICompatibleLlmClient implements LlmClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string> {
    if (req.temperature !== undefined) {
      if (
        typeof req.temperature !== 'number' ||
        !Number.isFinite(req.temperature) ||
        req.temperature < 0 ||
        req.temperature > 2
      ) {
        throw new Error(
          `Invalid temperature: ${req.temperature}. Must be a finite number between 0 and 2.`,
        );
      }
    }

    const temperature = req.temperature ?? 0.2;
    const data = await safeJsonFetch(
      new URL(
        'chat/completions',
        this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
      ),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          stream: false,
          temperature,
        }),
        redirect: 'error',
      },
      opts.timeoutMs,
      'LLM API request',
    );
    return extractContent(data);
  }

  async listModels(opts: { timeoutMs: number }): Promise<string[]> {
    const data = await safeJsonFetch(
      new URL(
        'models',
        this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
      ),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        redirect: 'error',
      },
      opts.timeoutMs,
      'LLM models request',
    );
    return extractModelIds(data);
  }
}

