import { describe, it, expect, vi } from 'vitest';
import { runDoctor } from '../src/doctor.js';
import type { Config, LlmClientPort, NexusClientPort } from '../src/types.js';

const mockConfig: Config = {
  nexusUrl: 'http://localhost:8080',
  nexusTimeoutMs: 1000,
  useContext: true,
  llmUrl: 'http://localhost:11434',
  llmApiKey: 'sk-test',
  llmModel: 'llama3',
  llmTimeoutMs: 60000,
  dryRun: false,
  nonInteractive: false,
  lang: 'ja',
  maxTokens: 2000,
  diffMode: 'staged',
  autoStartNexus: false,
};

const mockDeps = {
  nexus: {
    search: vi.fn().mockResolvedValue([]),
  } as unknown as NexusClientPort,
  llm: {
    listModels: vi.fn().mockResolvedValue(['llama3', 'mistral']),
  } as unknown as LlmClientPort,
};

describe('runDoctor', () => {
  it('Node.js 22 では auto-start 無効なら Node.js version を ok にする', async () => {
    vi.resetModules();
    vi.doMock('node:process', async () => {
      const actual = await vi.importActual<typeof import('node:process')>('node:process');
      return { ...actual, version: 'v22.11.0' };
    });
    try {
      const { runDoctor: run } = await import('../src/doctor.js');
      const report = await run({ ...mockConfig, autoStartNexus: false }, mockDeps);
      const nodeResult = report.results.find((r) => r.title === 'Node.js version');
      expect(nodeResult?.status).toBe('ok');
    } finally {
      vi.doUnmock('node:process');
    }
  });

  it('Node.js 22 では auto-start 有効なら Node.js version を fail にする', async () => {
    vi.resetModules();
    vi.doMock('node:process', async () => {
      const actual = await vi.importActual<typeof import('node:process')>('node:process');
      return { ...actual, version: 'v22.11.0' };
    });
    try {
      const { runDoctor: run } = await import('../src/doctor.js');
      const report = await run({ ...mockConfig, autoStartNexus: true }, mockDeps);
      const nodeResult = report.results.find((r) => r.title === 'Node.js version');
      expect(nodeResult?.status).toBe('fail');
    } finally {
      vi.doUnmock('node:process');
    }
  });

  it('should return a successful report when all checks pass', async () => {
    const report = await runDoctor(mockConfig, mockDeps);
    expect(report.exitCode).toBe(0);
    expect(report.results.every((r) => r.status === 'ok' || r.status === 'skip')).toBe(true);
  });

  it('should report fail if Nexus server is unreachable', async () => {
    const deps = {
      ...mockDeps,
      nexus: {
        search: vi.fn().mockRejectedValue(new Error('Nexus connection failed')),
      } as unknown as NexusClientPort,
    };
    const report = await runDoctor(mockConfig, deps);
    const nexusResult = report.results.find((r) => r.title === 'Nexus API reachable');
    expect(nexusResult?.status).toBe('fail');
    expect(report.exitCode).toBe(4);
  });

  it('should report fail if LLM endpoint is unreachable', async () => {
    const deps = {
      ...mockDeps,
      llm: {
        listModels: vi.fn().mockRejectedValue(new Error('LLM connection failed')),
      } as unknown as LlmClientPort,
    };
    const report = await runDoctor(mockConfig, deps);
    const llmResult = report.results.find((r) => r.title === 'LLM endpoint reachable');
    expect(llmResult?.status).toBe('fail');
    expect(report.exitCode).toBe(4);
  });

  it('.github/nxc.prompt.md が存在すれば ok', async () => {
    vi.resetModules();
    vi.doMock('../src/prompt-file.js', () => ({
      findPromptFile: vi.fn(async () => '/repo/.github/nxc.prompt.md'),
      loadPromptFile: vi.fn(),
    }));
    try {
      const { runDoctor: run } = await import('../src/doctor.js');
      const report = await run(mockConfig, mockDeps);
      const cp = report.results.find((x) => x.title === 'Custom prompt file');
      expect(cp?.status).toBe('ok');
      expect(cp?.detail).toContain('.github/nxc.prompt.md');
    } finally {
      vi.doUnmock('../src/prompt-file.js');
    }
  });

  it('.github/nxc.prompt.md が無ければ skip', async () => {
    vi.resetModules();
    vi.doMock('../src/prompt-file.js', () => ({
      findPromptFile: vi.fn(async () => null),
      loadPromptFile: vi.fn(),
    }));
    try {
      const { runDoctor: run } = await import('../src/doctor.js');
      const report = await run(mockConfig, mockDeps);
      const cp = report.results.find((x) => x.title === 'Custom prompt file');
      expect(cp?.status).toBe('skip');
      expect(cp?.detail).toContain('(or empty)');
    } finally {
      vi.doUnmock('../src/prompt-file.js');
    }
  });

  it('Custom prompt file 検索でエラーが発生した場合は warn', async () => {
    vi.resetModules();
    vi.doMock('../src/prompt-file.js', () => ({
      findPromptFile: vi.fn(async () => {
        throw new Error('FileSystem error');
      }),
      loadPromptFile: vi.fn(),
    }));
    try {
      const { runDoctor: run } = await import('../src/doctor.js');
      const report = await run(mockConfig, mockDeps);
      const cp = report.results.find((x) => x.title === 'Custom prompt file');
      expect(cp?.status).toBe('warn');
      expect(cp?.detail).toBe('FileSystem error');
    } finally {
      vi.doUnmock('../src/prompt-file.js');
    }
  });

  it('Nexus binary が解決できれば ok', async () => {
    const deps = {
      ...mockDeps,
      findNexusBinary: vi
        .fn()
        .mockResolvedValue({ binary: '/usr/local/bin/nexus', isNpxFallback: false }),
    };
    const report = await runDoctor(mockConfig, deps);
    const result = report.results.find((r) => r.title === 'Nexus binary');
    expect(result?.status).toBe('ok');
    expect(result?.detail).toContain('/usr/local/bin/nexus');
  });

  it('Nexus binary が解決できなくても warn', async () => {
    const deps = {
      ...mockDeps,
      findNexusBinary: vi.fn().mockRejectedValue(new Error('not found')),
    };
    const report = await runDoctor(mockConfig, deps);
    const result = report.results.find((r) => r.title === 'Nexus binary');
    expect(result?.status).toBe('warn');
  });

  it('Embed model (nomic-embed-text) があれば ok', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'nomic-embed-text' }] }),
    });
    const report = await runDoctor(mockConfig, {
      ...mockDeps,
      fetch: fetch as unknown as typeof fetch,
    });
    const result = report.results.find((r) => r.title === 'Embed model (nomic-embed-text)');
    expect(result?.status).toBe('ok');
  });

  it('Embed model (nomic-embed-text) がなければ warn', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3' }] }),
    });
    const report = await runDoctor(mockConfig, {
      ...mockDeps,
      fetch: fetch as unknown as typeof fetch,
    });
    const result = report.results.find((r) => r.title === 'Embed model (nomic-embed-text)');
    expect(result?.status).toBe('warn');
  });

  it('稼働中の daemon 状態を表示する', async () => {
    const readDaemonState = vi.fn().mockResolvedValue({ port: 9090, pid: 12345 });
    const report = await runDoctor(mockConfig, { ...mockDeps, readDaemonState });
    const result = report.results.find((r) => r.title === 'Nexus daemon status');
    expect(result?.status).toBe('ok');
    expect(result?.detail).toContain('pid=12345');
    expect(result?.detail).toContain('port=9090');
  });
});
