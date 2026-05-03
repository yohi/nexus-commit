import { describe, it, expect, vi } from 'vitest';
import { runDoctor } from '../src/doctor.js';
import type { Config, NexusClientPort, LlmClientPort } from '../src/types.js';

describe('runDoctor', () => {
  const mockConfig: Config = {
    nexusUrl: 'http://nexus',
    llmUrl: 'http://llm',
    llmModel: 'test-model',
    llmApiKey: 'key',
    lang: 'ja',
    maxTokens: 1000,
    nexusTimeoutMs: 1000,
    llmTimeoutMs: 1000,
    diffMode: 'staged',
    dryRun: false,
    useContext: true,
  };

  const mockDeps = {
    nexus: {
      search: vi.fn().mockResolvedValue([]),
    } as unknown as NexusClientPort,
    llm: {
      listModels: vi.fn().mockResolvedValue(['test-model', 'other-model']),
    } as unknown as LlmClientPort,
    cwd: '/tmp',
  };

  it('should report all ok when environment is healthy', async () => {
    const report = await runDoctor(mockConfig, mockDeps);
    expect(report.exitCode).toBe(0);
    expect(report.results.every((r) => r.status === 'ok' || r.status === 'skip')).toBe(true);
  });

  it('should report fail if nexus is unreachable', async () => {
    const deps = {
      ...mockDeps,
      nexus: {
        search: vi.fn().mockRejectedValue(new Error('Connection failed')),
      } as unknown as NexusClientPort,
    };
    const report = await runDoctor(mockConfig, deps);
    const nexusResult = report.results.find((r) => r.title === 'Nexus API reachable');
    expect(nexusResult?.status).toBe('fail');
    expect(report.exitCode).toBe(4);
  });

  it('should report fail if model is missing', async () => {
    const deps = {
      ...mockDeps,
      llm: {
        listModels: vi.fn().mockResolvedValue(['other-model']),
      } as unknown as LlmClientPort,
    };
    const report = await runDoctor(mockConfig, deps);
    const modelResult = report.results.find((r) => r.title === "Model 'test-model' found");
    expect(modelResult?.status).toBe('fail');
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
});
