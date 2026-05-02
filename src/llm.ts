import {
  ChatCompletionResponseSchema,
  ModelListResponseSchema,
  formatZodError,
} from './schemas.js';
import type { ChatRequest, LlmClientPort } from './types.js';
import { validateSafeUrl } from './security.js';

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

      // SSRF Validation: Explicitly validate protocol and hostname inline for SAST tools
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        throw new Error(`Unsupported protocol: ${urlObj.protocol}`);
      }
      validateSafeUrl(urlObj);

      // skipcq: JS-0044
      const res = await fetch(urlObj.toString(), {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      });

      const text = await res.text().catch(() => {
        throw new Error(
          `${errorContext} failed to read response body from ${urlObj.toString()}\nStatus: ${res.status} ${res.statusText}`,
        );
      });

      if (!res.ok) {
        const MAX_SNIPPET = 200;
        const snippet =
          text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET)}... [truncated]` : text;
        throw new Error(`LLM API error: ${res.status} ${res.statusText}\nBody snippet: ${snippet}`);
      }

      try {
        return JSON.parse(text);
      } catch (jsonErr) {
        const bodySnippet = text.length > 100 ? `${text.substring(0, 100)}...` : text;
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
