import type {
  NexusClientPort,
  NexusResult,
  NexusSearchRequest,
} from './types.js';

interface RawItem {
  file?: unknown;
  content?: unknown;
}

function parseResults(data: unknown): NexusResult[] {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('results' in data) ||
    !Array.isArray((data as { results: unknown }).results)
  ) {
    throw new Error('Invalid Nexus response: missing or non-array "results"');
  }
  const items = (data as { results: unknown[] }).results;
  return items.map((raw, idx) => {
    if (raw === null || typeof raw !== 'object') {
      throw new Error(`Invalid Nexus result item at index ${idx}: expected object`);
    }
    const item = raw as RawItem;
    if (typeof item.file !== 'string' || typeof item.content !== 'string') {
      throw new Error(
        `Invalid Nexus result item at index ${idx}: missing required strings`,
      );
    }
    return { file: item.file, content: item.content };
  });
}

export class HttpNexusClient implements NexusClientPort {
  private readonly normalizedBaseUrl: string;
  constructor(baseUrl: string) {
    this.normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  }

  async search(
    req: NexusSearchRequest,
    opts: { timeoutMs: number },
  ): Promise<NexusResult[]> {
    const timeout =
      opts && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
        ? opts.timeoutMs
        : 5000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res: Response;
    try {
      res = await fetch(`${this.normalizedBaseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Nexus search timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`Nexus API error: ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    return parseResults(data);
  }
}
