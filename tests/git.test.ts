import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { NodeGitClient } from '../src/git.js';

const mockExecFile = vi.mocked(execFile);

type CB = (error: Error | null, stdout: string, stderr: string) => void;

function stubSuccess(stdout: string): void {
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
    cb(null, stdout, '');
    return {} as never;
  }) as never);
}

function stubFailure(err: Error): void {
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
    cb(err, '', '');
    return {} as never;
  }) as never);
}

beforeEach(() => {
  mockExecFile.mockReset();
});

describe('NodeGitClient', () => {
  it('isRepo returns true when rev-parse succeeds', async () => {
    stubSuccess('true\n');
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      expect.any(Function),
    );
  });

  it('isRepo returns false when rev-parse fails', async () => {
    stubFailure(new Error('not a repo'));
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(false);
  });

  it('getDiff staged invokes git diff --staged', async () => {
    const outputs = [
      'diff content staged',
      'src/foo.ts\nsrc/bar.ts\n',
    ];
    let call = 0;
    mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
      cb(null, outputs[call++]!, '');
      return {} as never;
    }) as never);

    const client = new NodeGitClient();
    const result = await client.getDiff('staged');
    expect(result.diff).toBe('diff content staged');
    expect(result.files).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('getDiff unstaged uses no --staged flag', async () => {
    let seenArgs: string[] | undefined;
    mockExecFile.mockImplementation(((_cmd: string, args: string[], cb: CB) => {
      seenArgs = args;
      cb(null, 'diff', '');
      return {} as never;
    }) as never);
    await new NodeGitClient().getDiff('unstaged');
    expect(seenArgs).not.toContain('--staged');
  });

  it('getDiff all merges staged + unstaged', async () => {
    const outputs = ['staged-diff', 'unstaged-diff', 'a.ts\n', 'b.ts\n'];
    let call = 0;
    mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
      cb(null, outputs[call++]!, '');
      return {} as never;
    }) as never);
    const result = await new NodeGitClient().getDiff('all');
    expect(result.diff).toContain('staged-diff');
    expect(result.diff).toContain('unstaged-diff');
    expect(result.files).toEqual(expect.arrayContaining(['a.ts', 'b.ts']));
  });

  it('commit invokes git commit -m', async () => {
    stubSuccess('');
    await new NodeGitClient().commit('feat: add X');
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'feat: add X'],
      expect.any(Function),
    );
  });

  it('commit surfaces underlying error', async () => {
    stubFailure(new Error('pre-commit hook failed'));
    await expect(new NodeGitClient().commit('m')).rejects.toThrow('pre-commit hook failed');
  });
});
