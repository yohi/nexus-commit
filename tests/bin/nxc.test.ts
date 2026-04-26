import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../../src/bin/nxc.js';
import type { GitClient, NexusClientPort, LlmClientPort } from '../../src/types.js';

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
  };

  const overrides = { git: mockGit, nexus: mockNexus, llm: mockLlm };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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
});
