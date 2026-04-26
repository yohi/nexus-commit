import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as clack from '@clack/prompts';
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

describe('nxc main', () => {
  const mockGit: GitClient = {
    isRepo: vi.fn(),
    getDiff: vi.fn(),
    commit: vi.fn(),
  };
  const mockNexus: NexusClientPort = {
    search: vi.fn().mockResolvedValue([]),
  };
  const mockLlm: LlmClientPort = {
    chat: vi.fn(),
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
  });

  it('returns 3 when LLM generation fails', async () => {
    vi.mocked(mockGit.isRepo).mockResolvedValue(true);
    vi.mocked(mockGit.getDiff).mockResolvedValue({ diff: 'test diff', files: ['test.ts'] });
    const llmError = new Error('LLM Error');
    (llmError as any).exitCode = 3;
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
});
;
