import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export interface PromptFileLookupResult {
  readonly path: string | null;
  readonly content: string | null;
}

export async function loadPromptFile(
  cwd: string = process.cwd(),
  root?: string,
): Promise<PromptFileLookupResult> {
  const gitRoot = root ?? (await findGitRoot(cwd));
  if (gitRoot === null) {
    return { path: null, content: null };
  }

  const candidate = join(gitRoot, '.github', 'nxc.prompt.md');
  try {
    const content = await readFile(candidate, 'utf8');
    return { path: candidate, content: content.length > 0 ? content : null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path: candidate, content: null };
    }
    throw err;
  }
}

export async function findPromptFile(cwd: string = process.cwd()): Promise<string | null> {
  const root = await findGitRoot(cwd);
  if (root === null) {
    return null;
  }

  const result = await loadPromptFile(cwd, root);
  return result.content !== null ? result.path : null;
}
