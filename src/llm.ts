import { ChatCompletionResponseSchema, formatZodError } from './schemas.js';
import type { ChatRequest, LlmClientPort } from './types.js';

function extractContent(data: unknown): string {
  const parsed = ChatCompletionResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw formatZodError('Invalid LLM response', parsed.error);
  }
  // choices is guaranteed to have at least one item by Zod (.min(1))
  const choice = parsed.data.choices[0];
  return choice.message.content;
}

export class OpenAICompatibleLlmClient implements LlmClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string> {
    if (
      typeof opts.timeoutMs !== 'number' ||
      !Number.isFinite(opts.timeoutMs) ||
      opts.timeoutMs <= 0
    ) {
      throw new Error(`Invalid timeoutMs: ${opts.timeoutMs}. Must be a positive finite number.`);
    }
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
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, opts.timeoutMs);
    let res: Response;
    try {
      const url = new URL(
        'chat/completions',
        this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
      ).toString();
      res = await fetch(url, {
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
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`LLM API request timed out after ${opts.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '(failed to read body)');
      throw new Error(`LLM API error: ${res.status} ${res.statusText}\nBody: ${body}`);
    }
    const data = (await res.json()) as unknown;
    return extractContent(data);
  }
}
