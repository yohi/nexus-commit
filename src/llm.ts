import type { ChatRequest, LlmClientPort } from './types.js';

interface ChoiceShape {
  message?: { content?: unknown };
}

function extractContent(data: unknown): string {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('choices' in data) ||
    !Array.isArray((data as { choices: unknown }).choices)
  ) {
    throw new Error('Invalid LLM response: choices missing');
  }
  const choices = (data as { choices: ChoiceShape[] }).choices;
  if (choices.length === 0) {
    throw new Error('LLM returned empty choices');
  }
  const first = choices[0];
  if (!first || typeof (first as ChoiceShape).message?.content !== 'string') {
    throw new Error('LLM returned invalid message content');
  }
  return (first as ChoiceShape).message!.content as string;
}

export class OpenAICompatibleLlmClient implements LlmClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string> {
    if (typeof opts.timeoutMs !== 'number' || !Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
      throw new Error(`Invalid timeoutMs: ${opts.timeoutMs}. Must be a positive finite number.`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, opts.timeoutMs);
    let res: Response;
    try {
      const url = new URL('chat/completions', this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`).toString();
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
          temperature: req.temperature ?? 0.2,
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
