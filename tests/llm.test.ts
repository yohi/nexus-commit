import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleLlmClient } from '../src/llm.js';

describe('OpenAICompatibleLlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockRes(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }

  it('returns choices[0].message.content', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockRes({ choices: [{ message: { content: 'feat: add X' } }] }),
    );
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'ollama');
    const out = await client.chat(
      { system: 's', user: 'u', model: 'qwen' },
      { timeoutMs: 60000 },
    );
    expect(out).toBe('feat: add X');
  });

  it('POST /chat/completions with OpenAI-compatible body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockRes({ choices: [{ message: { content: 'x' } }] }),
    );
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await client.chat(
      { system: 'sys', user: 'usr', model: 'qwen' },
      { timeoutMs: 60000 },
    );
    const [url, opts] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect((opts!.headers as Record<string, string>)['Authorization']).toBe('Bearer k');
    const body = JSON.parse(opts!.body as string);
    expect(body.model).toBe('qwen');
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('throws on empty choices', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [] }));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/empty choices/);
  });

  it('throws on invalid message shape', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [{ message: {} }] }));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow();
  });

  it('throws on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({}, false, 401));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/LLM API error: 401/);
  });

  it('throws on 500', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({}, false, 500));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/LLM API error: 500/);
  });

  it('aborts on timeout', async () => {
    vi.mocked(fetch).mockImplementation(((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as never);
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 10 }),
    ).rejects.toThrow();
  });
});
