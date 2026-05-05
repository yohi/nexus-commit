import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateSafeUrl, safeJsonFetch } from '../src/security.js';

describe('validateSafeUrl', () => {
  it.each(['http://localhost:11434', 'https://api.openai.com', 'http://192.168.1.1:8080'])(
    'should allow valid http/https URL: %s',
    (url) => {
      expect(() => validateSafeUrl(new URL(url))).not.toThrow();
    },
  );

  it.each([
    ['file:///etc/passwd', 'Unsupported protocol: file:'],
    ['gopher://localhost', 'Unsupported protocol: gopher:'],
  ])('should throw for unsupported protocol: %s', (url, expected) => {
    expect(() => validateSafeUrl(new URL(url))).toThrow(expected);
  });

  it.each([
    'http://169.254.169.254',
    'http://metadata.google.internal',
    'http://metadata.google.internal.',
    'http://100.100.100.200',
    'http://metadata',
    'http://[fd00:ec2::254]',
    'http://[fe80::4001]',
    'http://[::ffff:169.254.169.254]',
    'http://[::ffff:a9fe:a9fe]',
    'http://[::FFFF:A9FE:A9FE]',
  ])('should throw for forbidden metadata host/IP: %s', (url) => {
    expect(() => validateSafeUrl(new URL(url))).toThrow(/Forbidden hostname:/);
  });
});

describe('safeJsonFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  it('should timeout if the initial fetch takes too long', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const signal = init?.signal;
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 50, 'Test context')).rejects.toThrow(
      'Test context timed out after 50ms',
    );
  });

  it('should timeout if the body read (text()) takes too long', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const signal = init?.signal;
      return {
        ok: true,
        text: async () => {
          return new Promise((_, reject) => {
            if (signal?.aborted) {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
              return;
            }
            signal?.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          });
        },
      } as Partial<Response> as Response;
    });

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 100, 'Test context')).rejects.toThrow(
      'Test context timed out after 100ms',
    );
  });

  it('should succeed if everything happens within timeout', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"status": "ok"}'),
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    const result = await safeJsonFetch(url, {}, 1000, 'Test context');
    expect(result).toEqual({ status: 'ok' });
  });

  it('should throw on invalid timeoutMs', async () => {
    const url = new URL('https://example.com/api');
    const cases = [0, -1, NaN, Infinity];
    for (const timeoutMs of cases) {
      await expect(safeJsonFetch(url, {}, timeoutMs, 'Test context')).rejects.toThrow(
        `Invalid timeoutMs: ${timeoutMs}. Must be a positive finite number.`,
      );
    }
  });

  it('should throw contextual error if fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network failure'));

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      'Test context request to https://example.com/api failed: Network failure',
    );
  });

  it('should throw contextual error if response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: () => Promise.resolve('Page not found'),
    } as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      /Test context error: 404 Not Found/,
    );
  });

  it('should throw error if content-length is too large', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-length': '6000000' }), // 6MB
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      '[Body too large to read safely]',
    );
  });

  it('should truncate error snippet if body text is too long', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
      headers: new Headers(),
      text: () => Promise.resolve('A'.repeat(300)),
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      /Body snippet: A{200}\.\.\. \[truncated\]/,
    );
  });

  it('should use reader to read body if response.body is present', async () => {
    const readerMock = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Hello') })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const bodyMock = {
      getReader: () => readerMock,
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      body: bodyMock,
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      /Body snippet: Hello/,
    );
    expect(readerMock.cancel).toHaveBeenCalled();
  });

  it('should throw error on invalid JSON response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('invalid json'),
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      /failed to parse JSON response/,
    );
  });

  it('should throw error if response.text() fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.reject(new Error('Read error')),
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      /failed to read response body/,
    );
  });

  it('should handle AbortError during response.text()', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      },
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      'Test context timed out after 1000ms',
    );
  });

  it('should handle AbortError during reader.read()', async () => {
    const readerMock = {
      read: vi.fn().mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const bodyMock = {
      getReader: () => readerMock,
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      body: bodyMock,
    } as Partial<Response> as Response);

    const url = new URL('https://example.com/api');
    await expect(safeJsonFetch(url, {}, 1000, 'Test context')).rejects.toThrow(
      'Test context timed out after 1000ms',
    );
  });
});
