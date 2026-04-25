import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpNexusClient } from '../src/nexus-client.js';

describe('HttpNexusClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockResponse(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }

  it('returns NexusResult[] on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ results: [{ file: 'a.ts', content: 'ctx' }] }),
    );
    const client = new HttpNexusClient('http://localhost:8080');
    const result = await client.search(
      { query: 'q', files: ['a.ts'] },
      { timeoutMs: 5000 },
    );
    expect(result).toEqual([{ file: 'a.ts', content: 'ctx' }]);
  });

  it('sends POST to /api/search with JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ results: [] }));
    const client = new HttpNexusClient('http://localhost:8080');
    await client.search({ query: 'q', files: [] }, { timeoutMs: 5000 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://localhost:8080/api/search');
    expect(opts!.method).toBe('POST');
    expect((opts!.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(opts!.body as string)).toEqual({ query: 'q', files: [] });
  });

  it('throws on 5xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, false, 500));
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow(/Nexus API error: 500/);
  });

  it('throws on 4xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, false, 404));
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow(/Nexus API error: 404/);
  });

  it('throws on invalid results schema', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ other: true }));
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow();
  });

  it('throws on invalid item shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ results: [{ file: 123, content: 'x' }] }),
    );
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow();
  });

  it('aborts on timeout', async () => {
    vi.mocked(fetch).mockImplementation(((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as never);
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 10 }),
    ).rejects.toThrow();
  });
});
