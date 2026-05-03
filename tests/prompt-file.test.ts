/* eslint-disable security/detect-non-literal-fs-filename */
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPromptFile, loadPromptFile } from '../src/prompt-file.js';

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nxc-prompt-file-'));
  execSync('git init -q', { cwd: dir });
  return dir;
}

describe('loadPromptFile', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = makeGitRepo();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('git ルート外なら path/content とも null', async () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'nxc-non-git-'));
    try {
      const out = await loadPromptFile(nonGit);
      expect(out).toEqual({ path: null, content: null });
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it('git ルート内でファイル不在なら path は候補、content は null', async () => {
    const out = await loadPromptFile(tmpRoot);
    expect(out.path?.endsWith(join('.github', 'nxc.prompt.md'))).toBe(true);
    expect(out.content).toBeNull();
  });

  it('ファイル存在時は content を返す', async () => {
    mkdirSync(join(tmpRoot, '.github'), { recursive: true });
    writeFileSync(join(tmpRoot, '.github', 'nxc.prompt.md'), '## JIRA\n- prefix');
    const out = await loadPromptFile(tmpRoot);
    expect(out.content).toBe('## JIRA\n- prefix');
  });

  it('ファイルが空の場合は content は null を返す', async () => {
    mkdirSync(join(tmpRoot, '.github'), { recursive: true });
    const candidate = join(tmpRoot, '.github', 'nxc.prompt.md');
    writeFileSync(candidate, '');
    const out = await loadPromptFile(tmpRoot);
    expect(out.path).toBe(candidate);
    expect(out.content).toBeNull();
  });

  it('git サブディレクトリから呼んでもルートを基準に解決する', async () => {
    mkdirSync(join(tmpRoot, '.github'), { recursive: true });
    writeFileSync(join(tmpRoot, '.github', 'nxc.prompt.md'), 'rule');
    const sub = join(tmpRoot, 'src', 'nested');
    mkdirSync(sub, { recursive: true });
    const out = await loadPromptFile(sub);
    expect(out.content).toBe('rule');
  });
});

describe('findPromptFile', () => {
  it('内容ありなら path、無ければ null', async () => {
    const tmpRoot = makeGitRepo();
    try {
      expect(await findPromptFile(tmpRoot)).toBeNull();
      mkdirSync(join(tmpRoot, '.github'), { recursive: true });
      writeFileSync(join(tmpRoot, '.github', 'nxc.prompt.md'), 'x');
      const path = await findPromptFile(tmpRoot);
      expect(path?.endsWith(join('.github', 'nxc.prompt.md'))).toBe(true);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('ファイルが空なら null を返す', async () => {
    const tmpRoot = makeGitRepo();
    try {
      mkdirSync(join(tmpRoot, '.github'), { recursive: true });
      writeFileSync(join(tmpRoot, '.github', 'nxc.prompt.md'), '');
      expect(await findPromptFile(tmpRoot)).toBeNull();
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'アクセス権限エラーなどの致命的なエラーは伝播する',
    async () => {
    const { chmodSync } = await import('node:fs');
    const tmpRoot = makeGitRepo();
    try {
      const dotGithub = join(tmpRoot, '.github');
      mkdirSync(dotGithub, { recursive: true });
      const promptPath = join(dotGithub, 'nxc.prompt.md');
      writeFileSync(promptPath, 'secrets');
      // 読み取り権限を剥奪
      chmodSync(promptPath, 0o000);
      
      await expect(findPromptFile(tmpRoot)).rejects.toThrow();
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
