import { describe, it, expect, vi } from 'vitest';
import { runDoctor, type DoctorReport } from '../src/doctor.js';
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
  lang: 'ja',
  maxTokens: 2000,
  diffMode: 'staged',
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
});
