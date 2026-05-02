import { NexusSearchResponseSchema, formatZodError } from './schemas.js';
import type { NexusClientPort, NexusResult, NexusSearchRequest } from './types.js';
import { safeFetch } from './security.js';

function parseResults(data: unknown): NexusResult[] {
  const parsed = NexusSearchResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw formatZodError('Invalid Nexus response', parsed.error);
  }
  return parsed.data.results;
}

export class HttpNexusClient implements NexusClientPort {
  private readonly normalizedBaseUrl: string;

  constructor(baseUrl: string) {
    this.normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  }

  async search(req: NexusSearchRequest, opts: { timeoutMs: number }): Promise<NexusResult[]> {
    const timeout = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : 5000;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      const url = new URL(`${this.normalizedBaseUrl}/api/search`);

      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        redirect: 'error',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Nexus API error: ${res.status}`);
      }

      const data = (await res.json()) as unknown;
      return parseResults(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Nexus search timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
