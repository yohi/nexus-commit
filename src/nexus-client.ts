import { NexusSearchResponseSchema, formatZodError } from './schemas.js';
import type { NexusClientPort, NexusResult, NexusSearchRequest } from './types.js';
import { safeJsonFetch } from './security.js';

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

    const url = new URL(`${this.normalizedBaseUrl}/api/search`);
    const data = await safeJsonFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        redirect: 'error',
      },
      timeout,
      'Nexus search',
    );
    return parseResults(data);
  }
}
