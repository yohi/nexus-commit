import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { NodeGitClient } from '../src/git.js';

const mockExecFile = vi.mocked(execFile);

type CB = (error: Error | null, stdout: string, stderr: string) => void;

function isCallback(value: unknown): value is CB {
  return typeof value === 'function';
}

function stubSuccess(stdout: string): void {
  mockExecFile.mockImplementation(((
    _cmd: string,
    _args: string[],
    optionsOrCb: object | CB,
    cb?: CB,
  ) => {
    const callback = isCallback(optionsOrCb) ? optionsOrCb : cb;
    callback?.(null, stdout, '');
  }) as unknown as typeof execFile);
}

function stubFailure(err: Error): void {
  mockExecFile.mockImplementation(((
    _cmd: string,
    _args: string[],
    optionsOrCb: object | CB,
    cb?: CB,
  ) => {
    const callback = isCallback(optionsOrCb) ? optionsOrCb : cb;
    callback?.(err, '', '');
  }) as unknown as typeof execFile);
}

beforeEach(() => {
  mockExecFile.mockReset();
});

describe('NodeGitClient', () => {
  it('isRepo returns true when rev-parse outputs true', async () => {
    stubSuccess('true\n');
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      { maxBuffer: 100 * 1024 * 1024 },
      expect.any(Function),
    );
  });

  it('isRepo returns false when rev-parse outputs false', async () => {
    stubSuccess('false\n');
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(false);
  });

  it('isRepo returns false when rev-parse fails', async () => {
    stubFailure(new Error('not a repo'));
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(false);
  });

  it('getDiff staged invokes git diff --staged', async () => {
    const outputs = ['diff content staged', 'src/foo.ts\nsrc/bar.ts\n'];
    let call = 0;
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      optionsOrCb: object | CB,
      cb?: CB,
    ) => {
      const callback = isCallback(optionsOrCb) ? optionsOrCb : cb;
      const output = outputs[call++];
      callback?.(null, output ?? '', '');
    }) as unknown as typeof execFile);

    const client = new NodeGitClient();
    const result = await client.getDiff('staged');
    expect(result.diff).toBe('diff content staged');
    expect(result.files).toEqual(['src/foo.ts', 'src/bar.ts']);

    // Assert underlying git calls include --staged
    const calls = mockExecFile.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toContain('--staged');
    expect(calls[1]?.[1]).toContain('--staged');
    expect(calls[1]?.[1]).toContain('--name-only');
  });

  it('getDiff unstaged invokes git diff without --staged', async () => {
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      optionsOrCb: object | CB,
      cb?: CB,
    ) => {
      const callback = isCallback(optionsOrCb) ? optionsOrCb : cb;
      callback?.(null, 'diff', '');
    }) as unknown as typeof execFile);

    await new NodeGitClient().getDiff('unstaged');

    // Verify both calls: diff and files
    const calls = mockExecFile.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).not.toContain('--staged');
    expect(calls[1]?.[1]).not.toContain('--staged');
  });

  it('getDiff all merges staged + unstaged with strict normalization', async () => {
    // staged-diff, unstaged-diff, staged-files, unstaged-files
    const outputs = [
      'staged-diff\n',
      'unstaged-diff',
      'common.ts\r\nstaged.ts\n',
      'common.ts\nunstaged.ts\r\n',
    ];
    let call = 0;
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      optionsOrCb: object | CB,
      cb?: CB,
    ) => {
      const callback = isCallback(optionsOrCb) ? optionsOrCb : cb;
      const output = outputs[call++];
      callback?.(null, output ?? '', '');
    }) as unknown as typeof execFile);

    const result = await new NodeGitClient().getDiff('all');

    // Verify strict combined diff
    expect(result.diff).toBe('staged-diff\n\nunstaged-diff');

    // Verify strict deduplicated and normalized files
    expect(result.files).toEqual(['common.ts', 'staged.ts', 'unstaged.ts']);
  });

  it('commit invokes git commit -m', async () => {
    stubSuccess('');
    await new NodeGitClient().commit('feat: add X');
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'feat: add X'],
      { maxBuffer: 100 * 1024 * 1024 },
      expect.any(Function),
    );
  });

  it('commit surfaces underlying error', async () => {
    stubFailure(new Error('pre-commit hook failed'));
    await expect(new NodeGitClient().commit('m')).rejects.toThrow('pre-commit hook failed');
  });
});
