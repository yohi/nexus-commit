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
    const item = raw as RawItem;
    if (typeof item.file !== 'string' || typeof item.content !== 'string') {
      throw new Error(`Invalid Nexus result item at index ${idx}`);
    }
    return { file: item.file, content: item.content };
  });
}

export class HttpNexusClient implements NexusClientPort {
  constructor(private readonly baseUrl: string) {}

  async search(
    req: NexusSearchRequest,
    opts: { timeoutMs: number },
  ): Promise<NexusResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
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
