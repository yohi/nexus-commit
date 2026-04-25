import { execFile } from 'node:child_process';
import type { DiffMode, DiffResult, GitClient } from './types.js';

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { maxBuffer: 100 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

async function diffStaged(): Promise<string> {
  return runGit(['diff', '--staged', '--no-color']);
}

async function diffUnstaged(): Promise<string> {
  return runGit(['diff', '--no-color']);
}

async function filesStaged(): Promise<string[]> {
  const out = await runGit(['diff', '--name-only', '--staged']);
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function filesUnstaged(): Promise<string[]> {
  const out = await runGit(['diff', '--name-only']);
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export class NodeGitClient implements GitClient {
  async isRepo(): Promise<boolean> {
    try {
      await runGit(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  async getDiff(mode: DiffMode): Promise<DiffResult> {
    if (mode === 'staged') {
      const [diff, files] = await Promise.all([diffStaged(), filesStaged()]);
      return { diff, files };
    }
    if (mode === 'unstaged') {
      const [diff, files] = await Promise.all([diffUnstaged(), filesUnstaged()]);
      return { diff, files };
    }
    if (mode === 'all') {
      const [s, u, sf, uf] = await Promise.all([
        diffStaged(),
        diffUnstaged(),
        filesStaged(),
        filesUnstaged(),
      ]);
      return {
        diff: [s, u].filter(Boolean).join('\n'),
        files: [...new Set([...sf, ...uf])],
      };
    }
    throw new Error(`Unsupported diff mode: ${mode}`);
  }

  async commit(message: string): Promise<void> {
    await runGit(['commit', '-m', message]);
  }
}
