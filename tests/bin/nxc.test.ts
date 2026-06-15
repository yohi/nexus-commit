import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as clack from '@clack/prompts';
import { logger } from '../../src/logger.js';
import { main } from '../../src/bin/nxc.js';
import type { GitClient, NexusClientPort, LlmClientPort } from '../../src/types.js';

const mockSpinner = {
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  spinner: vi.fn(() => mockSpinner),
  cancel: vi.fn(),
  isCancel: (val: unknown) => val === Symbol.for('clack:cancel'),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  note: vi.fn(),
}));
vi.mock('../../src/prompt-file.js', () => ({
  loadPromptFile: vi.fn(async () => ({ path: null, content: null })),
  findPromptFile: vi.fn(async () => null),
}));

vi.mock('../../src/nexus-client.js', () => ({
  HttpNexusClient: vi.fn().mockImplementation((baseUrl: string) => ({
    search: vi.fn().mockResolvedValue([]),
    baseUrl,
  })),
}));

describe('nxc main', () => {
  const mockGit: GitClient = {
    isRepo: vi.fn(),
    getDiff: vi.fn(),
    commit: vi.fn(),
  };
  const mockNexus: NexusClientPort = {
    search: vi.fn(),
  };
  const mockLlm: LlmClientPort = {
    chat: vi.fn(),
    listModels: vi.fn(),
  };

  const overrides = { git: mockGit, nexus: mockNexus, llm: mockLlm };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(mockNexus.search).mockResolvedValue([]);
    vi.mocked(clack.select).mockResolvedValue('abort');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows help and returns 0 when --help is passed', async () => {
    const code = await main(['--help'], overrides);
    expect(code).toBe(0);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Usage: nxc'));
  });

  it('shows version and returns 0 when --version is passed', async () => {
    const code = await main(['--version'], overrides);
    expect(code).toBe(0);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+/));
  });

  it('returns 2 when not a git repository', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(false);
    const code = await main([], overrides);
    expect(code).toBe(2);
  });

  it('returns 0 and shows message when no changes', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: '', files: [] });
    const code = await main([], overrides);
    expect(code).toBe(0);
  });

  it('returns 2 on invalid flags', async () => {
    const code = await main(['--invalid-flag'], overrides);
    expect(code).toBe(2);
  });

  it('runs successfully in dry-run mode', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const code = await main(['--dry-run'], overrides);
    expect(code).toBe(0);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('feat: test commit'));
    expect(mockGit.commit).not.toHaveBeenCalled();
  });

  it('returns 3 when LLM generation fails', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    const llmError = Object.assign(new Error('LLM Error'), { exitCode: 3 });
    vi.mocked(mockLlm.chat).mockRejectedValue(llmError);

    const code = await main([], overrides);
    expect(code).toBe(3);
    expect(clack.cancel).toHaveBeenCalledWith('生成に失敗しました');
  });

  it('continues and returns 0 when Nexus lookup fails but commit succeeds', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockNexus.search).mockRejectedValue(new Error('Nexus Down'));
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const code = await main([], overrides);
    expect(code).toBe(0);
    expect(mockGit.commit).toHaveBeenCalledWith('feat: test commit');
  });

  it('カスタムプロンプトが存在すれば LLM の system に append される', async () => {
    const { loadPromptFile } = await import('../../src/prompt-file.js');
    vi.mocked(loadPromptFile).mockResolvedValue({
      path: '/repo/.github/nxc.prompt.md',
      content: '## JIRA prefix rule',
    });
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['a.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: x');
    vi.mocked(clack.select).mockResolvedValue('commit');

    await main(['--dry-run'], overrides);

    const call = vi.mocked(mockLlm.chat).mock.calls[0];
    expect(call).toBeDefined();
    const req = call?.[0];
    expect(req?.system).toContain('# プロジェクト固有ルール');
    expect(req?.system).toContain('## JIRA prefix rule');
  });

  it('カスタムプロンプト読み込みが I/O エラーでも続行する', async () => {
    const { loadPromptFile } = await import('../../src/prompt-file.js');
    vi.mocked(loadPromptFile).mockRejectedValue(new Error('EACCES'));
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'd', files: ['a.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: x');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const code = await main(['--dry-run'], overrides);
    expect(code).toBe(0);
  });

  it('does not load custom prompt when --doctor is passed', async () => {
    const { loadPromptFile } = await import('../../src/prompt-file.js');
    vi.mocked(loadPromptFile).mockResolvedValue({ path: '/foo', content: 'bar' });
    vi.mocked(mockLlm.listModels).mockResolvedValue(['llama3']);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await main(['--doctor'], overrides);

    expect(loadPromptFile).not.toHaveBeenCalled();
  });

  it('カスタムプロンプトが PROMPT_SUFFIX_MAX_TOKENS を超えると末尾を切り詰めて警告する', async () => {
    const { loadPromptFile } = await import('../../src/prompt-file.js');
    const { PROMPT_SUFFIX_MAX_TOKENS, countTokens } = await import('../../src/tokenizer.js');
    const huge = 'The quick brown fox jumps over the lazy dog. '.repeat(300);
    expect(countTokens(huge)).toBeGreaterThan(PROMPT_SUFFIX_MAX_TOKENS);

    vi.mocked(loadPromptFile).mockResolvedValue({
      path: '/repo/.github/nxc.prompt.md',
      content: huge,
    });
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'd', files: ['a.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: x');
    vi.mocked(clack.select).mockResolvedValue('commit');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await main(['--dry-run'], overrides);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`${PROMPT_SUFFIX_MAX_TOKENS}`));

    const call = vi.mocked(mockLlm.chat).mock.calls[0];
    expect(call).toBeDefined();
    const systemContent = call?.[0].system ?? '';
    const suffixSection = systemContent.split('# プロジェクト固有ルール\n')[1] ?? '';
    expect(countTokens(suffixSection)).toBeLessThanOrEqual(PROMPT_SUFFIX_MAX_TOKENS);
    expect(suffixSection.length).toBeLessThan(huge.length);

    warnSpy.mockRestore();
  });

  it('LLM がコードブロックで囲って出力した場合にクリーンアップする', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'd', files: ['a.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('```\nfeat: x\n```');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main(['--dry-run'], overrides);

    expect(writeSpy).toHaveBeenCalledWith('feat: x\n');
    writeSpy.mockRestore();
  });

  it('1行のコードブロックで囲まれた場合もクリーンアップする', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'd', files: ['a.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('```feat: y```');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main(['--dry-run'], overrides);

    expect(writeSpy).toHaveBeenCalledWith('feat: y\n');
    writeSpy.mockRestore();
  });

  it('--auto-start-nexus で Nexus daemon を自動起動し、解決したポートを使う', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const ensureDaemon = vi.fn().mockResolvedValue({ port: 9999 });
    const getRepoRoot = vi.fn().mockResolvedValue('/repo');
    const { HttpNexusClient } = await import('../../src/nexus-client.js');

    const original = process.env.CI;
    delete process.env.CI;
    let code = -1;
    try {
      code = await main(['--auto-start-nexus', '--dry-run'], {
        git: mockGit,
        llm: mockLlm,
        ensureDaemon,
        getRepoRoot,
      });
    } finally {
      if (original === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = original;
      }
    }

    expect(code).toBe(0);
    expect(getRepoRoot).toHaveBeenCalled();
    expect(ensureDaemon).toHaveBeenCalledWith(expect.objectContaining({ repoRoot: '/repo' }));
    expect(HttpNexusClient).toHaveBeenCalledWith('http://127.0.0.1:9999');
  });

  it('NEXUS_API_URL が明示指定されている場合は自動起動しない', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const ensureDaemon = vi.fn().mockResolvedValue({ port: 9999 });
    const getRepoRoot = vi.fn().mockResolvedValue('/repo');
    const { HttpNexusClient } = await import('../../src/nexus-client.js');

    const original = process.env.NEXUS_API_URL;
    process.env.NEXUS_API_URL = 'http://existing:8080';
    try {
      await main(['--auto-start-nexus', '--dry-run'], {
        git: mockGit,
        llm: mockLlm,
        ensureDaemon,
        getRepoRoot,
      });
    } finally {
      if (original === undefined) {
        delete process.env.NEXUS_API_URL;
      } else {
        process.env.NEXUS_API_URL = original;
      }
    }

    expect(ensureDaemon).not.toHaveBeenCalled();
    expect(HttpNexusClient).toHaveBeenCalledWith('http://existing:8080');
  });

  it('--non-interactive 時は自動起動しない', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');

    const ensureDaemon = vi.fn().mockResolvedValue({ port: 9999 });

    await main(['--auto-start-nexus', '--non-interactive', '--dry-run'], {
      ...overrides,
      ensureDaemon,
    });

    expect(ensureDaemon).not.toHaveBeenCalled();
  });

  it('CI 環境では自動起動しない', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const ensureDaemon = vi.fn().mockResolvedValue({ port: 9999 });

    const original = process.env.CI;
    process.env.CI = 'true';
    try {
      await main(['--auto-start-nexus', '--dry-run'], {
        ...overrides,
        ensureDaemon,
      });
    } finally {
      if (original === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = original;
      }
    }

    expect(ensureDaemon).not.toHaveBeenCalled();
  });

  it('daemon 自動起動に失敗しても graceful fallback する', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    vi.mocked(mockLlm.chat).mockResolvedValue('feat: test commit');
    vi.mocked(clack.select).mockResolvedValue('commit');

    const ensureDaemon = vi.fn().mockRejectedValue(new Error('nexus not found'));
    const getRepoRoot = vi.fn().mockResolvedValue('/repo');
    const { HttpNexusClient } = await import('../../src/nexus-client.js');

    const original = process.env.CI;
    delete process.env.CI;
    let code = -1;
    try {
      code = await main(['--auto-start-nexus', '--dry-run'], {
        git: mockGit,
        llm: mockLlm,
        ensureDaemon,
        getRepoRoot,
      });
    } finally {
      if (original === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = original;
      }
    }

    expect(code).toBe(0);
    expect(ensureDaemon).toHaveBeenCalled();
    expect(HttpNexusClient).toHaveBeenCalledWith('http://localhost:8080');
  });
});
