import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleLlmClient } from '../src/llm.js';

function mockRes(body: unknown, ok = true, status = 200, statusText = 'OK'): Response {
  return {
    ok,
    status,
    statusText,
    headers: new Headers(),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function mockAbort(_url: unknown, opts: { signal: AbortSignal }): Promise<never> {
  return new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

describe('OpenAICompatibleLlmClient', () => {
  const baseUrl = 'http://localhost:11434/v1';
  const apiKey = 'k';
  let client: OpenAICompatibleLlmClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    client = new OpenAICompatibleLlmClient(baseUrl, apiKey);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('chat', () => {
    it('returns choices[0].message.content', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockRes({ choices: [{ message: { content: 'feat: add X' } }] }),
      );
      const out = await client.chat({ system: 's', user: 'u', model: 'qwen' }, { timeoutMs: 60000 });
      expect(out).toBe('feat: add X');
    });

    it('POST /chat/completions with OpenAI-compatible body', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [{ message: { content: 'x' } }] }));
      await client.chat(
        { system: 'sys', user: 'usr', model: 'qwen', temperature: 0.5 },
        { timeoutMs: 60000 },
      );
      const call = vi.mocked(fetch).mock.calls[0];
      expect(call).toBeDefined();
      const [url, opts] = call as [string | URL, RequestInit];
      expect(url.toString()).toBe(`${baseUrl}/chat/completions`);
      expect((opts.headers as Record<string, string>).Authorization).toBe(`Bearer ${apiKey}`);
      const body = JSON.parse(opts.body as string);
      expect(body.model).toBe('qwen');
      expect(body.stream).toBe(false);
      expect(body.temperature).toBe(0.5);
      expect(body.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ]);
    });

    it('uses default temperature of 0.2 if not provided', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [{ message: { content: 'x' } }] }));
      await client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 });
      const call = vi.mocked(fetch).mock.calls[0];
      const opts = (call as [string, RequestInit])[1];
      const body = JSON.parse(opts.body as string);
      expect(body.temperature).toBe(0.2);
    });

    it('removes trailing slash from baseUrl or handles it correctly', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [{ message: { content: 'x' } }] }));
      const clientSlash = new OpenAICompatibleLlmClient(`${baseUrl}/`, apiKey);
      await clientSlash.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 60000 });
      const call = vi.mocked(fetch).mock.calls[0];
      expect((call as [string | URL, RequestInit])[0].toString()).toBe(`${baseUrl}/chat/completions`);
    });

    it('throws on unsupported protocol (SSRF mitigation)', async () => {
      const badClient = new OpenAICompatibleLlmClient('file:///etc/passwd', apiKey);
      await expect(
        badClient.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Unsupported protocol: file:/);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws on invalid timeoutMs', async () => {
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 0 }),
      ).rejects.toThrow(/Invalid timeoutMs/);
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: -1 }),
      ).rejects.toThrow(/Invalid timeoutMs/);
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: NaN }),
      ).rejects.toThrow(/Invalid timeoutMs/);
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: Infinity }),
      ).rejects.toThrow(/Invalid timeoutMs/);
    });

    it('throws on invalid temperature', async () => {
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm', temperature: -0.1 }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Invalid temperature/);
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm', temperature: 2.1 }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Invalid temperature/);
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm', temperature: NaN }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Invalid temperature/);
    });

    it('throws detailed error on invalid JSON response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: `${baseUrl}/chat/completions`,
        text: async () => '<html><body>502 Bad Gateway</body></html>',
      } as Response);

      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/failed to parse JSON response/);
    });

    it('throws when choices field is missing', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({}));
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Invalid LLM response at choices: /);
    });

    it('throws when first choice is null or undefined', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [null] }));
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Invalid LLM response at choices\.0: /);
    });

    it('throws on empty choices', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [] }));
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(
        /Invalid LLM response at choices: choices must contain at least one item/,
      );
    });

    it('throws on invalid message shape', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [{ message: {} }] }));
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/Invalid LLM response at choices\.0\.message\.content: /);
    });

    it('throws on 401 with error body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockRes({ error: 'Unauthorized' }, false, 401, 'Unauthorized'),
      );
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
      ).rejects.toThrow(/LLM API request error: 401 Unauthorized\nBody snippet: {"error":"Unauthorized"}/);
    });

    it('throws specific error on timeout', async () => {
      vi.mocked(fetch).mockImplementation(mockAbort as never);
      await expect(
        client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 10 }),
      ).rejects.toThrow(/LLM API request timed out after 10ms/);
    });
  });

  describe('listModels', () => {
    it('GET /models で id 配列を返す', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockRes({ data: [{ id: 'qwen2.5-coder:7b' }, { id: 'llama3.2:3b' }] }),
      );
      const ids = await client.listModels({ timeoutMs: 3000 });
      expect(ids).toEqual(['qwen2.5-coder:7b', 'llama3.2:3b']);

      const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string | URL, RequestInit];
      expect(url.toString()).toBe(`${baseUrl}/models`);
      expect(opts.method ?? 'GET').toBe('GET');
    });

    it('AbortError で timeout エラーに変換する', async () => {
      vi.mocked(fetch).mockImplementation(mockAbort as never);
      await expect(client.listModels({ timeoutMs: 10 })).rejects.toThrow(
        /LLM models request timed out after 10ms/,
      );
    });

    it('throws on invalid timeoutMs', async () => {
      await expect(client.listModels({ timeoutMs: 0 })).rejects.toThrow(/Invalid timeoutMs/);
      await expect(client.listModels({ timeoutMs: -1 })).rejects.toThrow(/Invalid timeoutMs/);
      await expect(client.listModels({ timeoutMs: NaN })).rejects.toThrow(/Invalid timeoutMs/);
      await expect(client.listModels({ timeoutMs: Infinity })).rejects.toThrow(/Invalid timeoutMs/);
    });

    it('throws on invalid models response format', async () => {
      vi.mocked(fetch).mockResolvedValue(mockRes({ data: [{}] }));
      await expect(client.listModels({ timeoutMs: 3000 })).rejects.toThrow(
        /Invalid LLM models response/,
      );
    });
  });
});