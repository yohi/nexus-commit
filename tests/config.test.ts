import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { Flags } from '../src/flags.js';

const baseFlags: Flags = {
  diffMode: 'staged',
  dryRun: false,
  useContext: true,
  help: false,
  version: false,
  doctor: false,
  json: false,
};

describe('loadConfig', () => {
  it('applies defaults when env is empty', () => {
    const cfg = loadConfig({}, baseFlags);
    expect(cfg.nexusUrl).toBe('http://localhost:8080');
    expect(cfg.llmUrl).toBe('http://localhost:11434/v1');
    expect(cfg.llmModel).toBe('qwen2.5-coder:1.5b');
    expect(cfg.llmApiKey).toBe('ollama');
    expect(cfg.lang).toBe('ja');
    expect(cfg.maxTokens).toBe(8192);
    expect(cfg.nexusTimeoutMs).toBe(5000);
    expect(cfg.llmTimeoutMs).toBe(60000);
    expect(cfg.diffMode).toBe('staged');
    expect(cfg.dryRun).toBe(false);
    expect(cfg.useContext).toBe(true);
  });

  it('env overrides defaults', () => {
    const cfg = loadConfig(
      {
        NEXUS_API_URL: 'http://nexus.example:9090',
        NEXUS_COMMIT_LLM_URL: 'http://llm.example/v1',
        NEXUS_COMMIT_LLM_MODEL: 'llama3:8b',
        NEXUS_COMMIT_LLM_API_KEY: 'secret',
        NEXUS_COMMIT_LANG: 'en',
        NEXUS_COMMIT_MAX_TOKENS: '6400',
        NEXUS_COMMIT_NEXUS_TIMEOUT_MS: '3000',
        NEXUS_COMMIT_LLM_TIMEOUT_MS: '90000',
      },
      baseFlags,
    );
    expect(cfg.nexusUrl).toBe('http://nexus.example:9090');
    expect(cfg.llmUrl).toBe('http://llm.example/v1');
    expect(cfg.llmModel).toBe('llama3:8b');
    expect(cfg.llmApiKey).toBe('secret');
    expect(cfg.lang).toBe('en');
    expect(cfg.maxTokens).toBe(6400);
    expect(cfg.nexusTimeoutMs).toBe(3000);
    expect(cfg.llmTimeoutMs).toBe(90000);
  });

  it('flags override env', () => {
    const cfg = loadConfig(
      { NEXUS_COMMIT_LANG: 'en', NEXUS_COMMIT_LLM_MODEL: 'envModel' },
      { ...baseFlags, lang: 'ja', model: 'flagModel' },
    );
    expect(cfg.lang).toBe('ja');
    expect(cfg.llmModel).toBe('flagModel');
  });

  it('throws on invalid lang env', () => {
    expect(() => loadConfig({ NEXUS_COMMIT_LANG: 'fr' }, baseFlags)).toThrow(/Invalid lang/);
  });

  it('throws on non-numeric maxTokens', () => {
    expect(() => loadConfig({ NEXUS_COMMIT_MAX_TOKENS: 'abc' }, baseFlags)).toThrow(
      /Invalid maxTokens/,
    );
    expect(() => loadConfig({ NEXUS_COMMIT_MAX_TOKENS: '3000ms' }, baseFlags)).toThrow(
      /Invalid maxTokens/,
    );
    expect(() => loadConfig({ NEXUS_COMMIT_MAX_TOKENS: '1.5' }, baseFlags)).toThrow(
      /Invalid maxTokens/,
    );
  });

  it('throws on zero maxTokens', () => {
    expect(() => loadConfig({ NEXUS_COMMIT_MAX_TOKENS: '0' }, baseFlags)).toThrow(
      /Invalid maxTokens/,
    );
  });

  it('throws on invalid llmTimeoutMs (negative or non-numeric)', () => {
    expect(() => loadConfig({ NEXUS_COMMIT_LLM_TIMEOUT_MS: '-1' }, baseFlags)).toThrow(
      /Invalid llmTimeoutMs/,
    );
    expect(() => loadConfig({ NEXUS_COMMIT_LLM_TIMEOUT_MS: '3000ms' }, baseFlags)).toThrow(
      /Invalid llmTimeoutMs/,
    );
    expect(() => loadConfig({ NEXUS_COMMIT_LLM_TIMEOUT_MS: '1.5' }, baseFlags)).toThrow(
      /Invalid llmTimeoutMs/,
    );
  });

  it('throws on unsafe integer', () => {
    const tooLarge = (Number.MAX_SAFE_INTEGER + 1).toString();
    expect(() => loadConfig({ NEXUS_COMMIT_MAX_TOKENS: tooLarge }, baseFlags)).toThrow(
      /Invalid maxTokens/,
    );
  });

  it('accepts MAX_SAFE_INTEGER', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER.toString();
    const cfg = loadConfig({ NEXUS_COMMIT_MAX_TOKENS: maxSafe }, baseFlags);
    expect(cfg.maxTokens).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('--no-context propagates to useContext:false', () => {
    const cfg = loadConfig({}, { ...baseFlags, useContext: false });
    expect(cfg.useContext).toBe(false);
  });

  it('diffMode flag propagates', () => {
    const cfg = loadConfig({}, { ...baseFlags, diffMode: 'all' });
    expect(cfg.diffMode).toBe('all');
  });

  it('NEXUS_COMMIT_MAX_CHARS が設定されている場合 stderr に廃止警告を出力する', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadConfig({ NEXUS_COMMIT_MAX_CHARS: '24000' }, baseFlags);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXUS_COMMIT_MAX_CHARS は廃止されました'),
    );
    stderrSpy.mockRestore();
  });

  it('NEXUS_COMMIT_MAX_CHARS が未設定なら廃止警告を出力しない', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadConfig({}, baseFlags);
    expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining('NEXUS_COMMIT_MAX_CHARS'));
    stderrSpy.mockRestore();
  });
});
