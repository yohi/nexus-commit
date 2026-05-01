import {
  ChatCompletionResponseSchema,
  ModelListResponseSchema,
  formatZodError,
} from './schemas.js';
import type { ChatRequest, LlmClientPort } from './types.js';

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
    const data = await this.doFetch(
      'chat/completions',
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
      },
      opts.timeoutMs,
      'LLM API request',
    );
    return extractContent(data);
  }

  async listModels(opts: { timeoutMs: number }): Promise<string[]> {
    const data = await this.doFetch(
      'models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
      opts.timeoutMs,
      'LLM models request',
    );
    return extractModelIds(data);
  }

  private async doFetch(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    errorContext: string,
  ): Promise<unknown> {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`Invalid timeoutMs: ${timeoutMs}. Must be a positive finite number.`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const urlObj = new URL(
        path,
        this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
      );
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        throw new Error(`Unsupported protocol: ${urlObj.protocol}`);
      }
      const res = await fetch(urlObj.toString(), {
        ...init,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '(failed to read body)');
        throw new Error(`LLM API error: ${res.status} ${res.statusText}\nBody: ${body}`);
      }

      try {
        return await res.json();
      } catch (jsonErr) {
        const bodySnippet = await res
          .text()
          .then((t) => (t.length > 100 ? `${t.substring(0, 100)}...` : t))
          .catch(() => '(failed to read body)');
        throw new Error(
          `${errorContext} failed to parse JSON response from ${urlObj.toString()}\nStatus: ${res.status}\nBody snippet: ${bodySnippet}`,
          { cause: jsonErr },
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`${errorContext} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
