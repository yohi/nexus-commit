import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleLlmClient } from '../src/llm.js';

describe('OpenAICompatibleLlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockRes(body: unknown, ok = true, status = 200, statusText = 'OK'): Response {
    return {
      ok,
      status,
      statusText,
      json: async () => body,
      text: async () => typeof body === 'string' ? body : JSON.stringify(body),
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
      { system: 'sys', user: 'usr', model: 'qwen', temperature: 0.5 },
      { timeoutMs: 60000 },
    );
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call).toBeDefined();
    const [url, opts] = call as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('qwen');
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.5);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('removes trailing slash from baseUrl or handles it correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockRes({ choices: [{ message: { content: 'x' } }] }),
    );
    // test with trailing slash
    const client1 = new OpenAICompatibleLlmClient('http://localhost:11434/v1/', 'k');
    await client1.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 60000 });
    const call1 = vi.mocked(fetch).mock.calls[0];
    expect(call1).toBeDefined();
    expect(call1![0]).toBe('http://localhost:11434/v1/chat/completions');

    // test without trailing slash
    const client2 = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await client2.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 60000 });
    const call2 = vi.mocked(fetch).mock.calls[1];
    expect(call2).toBeDefined();
    expect(call2![0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('throws on invalid timeoutMs', async () => {
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 0 }),
    ).rejects.toThrow(/Invalid timeoutMs/);
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: -1 }),
    ).rejects.toThrow(/Invalid timeoutMs/);
  });

  it('throws when choices field is missing', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({}));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/choices missing/);
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

  it('throws on 401 with error body', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({ error: 'Unauthorized' }, false, 401, 'Unauthorized'));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/LLM API error: 401 Unauthorized\nBody: {"error":"Unauthorized"}/);
  });

  it('throws specific error on timeout', async () => {
    vi.mocked(fetch).mockImplementation(((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as never);
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 10 }),
    ).rejects.toThrow(/LLM API request timed out after 10ms/);
  });
});
