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
  if (!first || typeof first.message?.content !== 'string') {
    throw new Error('LLM returned invalid message content');
  }
  return first.message.content;
}

export class OpenAICompatibleLlmClient implements LlmClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
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
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`LLM API error: ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    return extractContent(data);
  }
}
