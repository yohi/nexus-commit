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
    .filter((s) => s !== '');
}

async function filesUnstaged(): Promise<string[]> {
  const out = await runGit(['diff', '--name-only']);
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export class NodeGitClient implements GitClient {
  async isRepo(): Promise<boolean> {
    try {
      const out = await runGit(['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true';
    } catch {
      return false;
    }
  }

  async getDiff(mode: DiffMode): Promise<DiffResult> {
    switch (mode) {
      case 'staged': {
        const [diff, files] = await Promise.all([diffStaged(), filesStaged()]);
        return { diff, files };
      }
      case 'unstaged': {
        const [diff, files] = await Promise.all([diffUnstaged(), filesUnstaged()]);
        return { diff, files };
      }
      case 'all': {
        const [s, u, sf, uf] = await Promise.all([
          diffStaged(),
          diffUnstaged(),
          filesStaged(),
          filesUnstaged(),
        ]);
        return {
          diff: [s, u].filter((str) => str !== '').join('\n'),
          files: [...new Set([...sf, ...uf])],
        };
      }
      default: {
        const exhaustiveCheck: never = mode;
        throw new Error(`Unsupported diff mode: ${exhaustiveCheck as string}`);
      }
    }
  }

  async commit(message: string): Promise<void> {
    await runGit(['commit', '-m', message]);
  }
}
