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
    const url = new URL(`${this.normalizedBaseUrl}/api/search`);
    const data = await safeJsonFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        redirect: 'error',
      },
      opts.timeoutMs,
      'Nexus search',
    );
    return parseResults(data);
  }
}
