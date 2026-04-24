import { describe, it, expect } from 'vitest';
import { build } from '../src/prompt.js';
import type { NexusResult } from '../src/types.js';

describe('prompt.build', () => {
  it('emits Japanese instruction when lang=ja', () => {
    const { system } = build({
      diff: '+x',
      contexts: [],
      files: ['a.ts'],
      lang: 'ja',
    });
    expect(system).toContain('日本語');
  });

  it('emits English instruction when lang=en', () => {
    const { system } = build({
      diff: '+x',
      contexts: [],
      files: ['a.ts'],
      lang: 'en',
    });
    expect(system).toContain('English');
  });

  it('system prompt lists all Conventional Commits types', () => {
    const { system } = build({ diff: '+x', contexts: [], files: [], lang: 'ja' });
    for (const t of [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'build',
      'ci',
      'chore',
      'revert',
    ]) {
      expect(system).toContain(t);
    }
    expect(system).toContain('BREAKING CHANGE');
  });

  it('user prompt includes file list', () => {
    const { user } = build({
      diff: '+x',
      contexts: [],
      files: ['src/a.ts', 'src/b.ts'],
      lang: 'ja',
    });
    expect(user).toContain('src/a.ts');
    expect(user).toContain('src/b.ts');
  });

  it('omits context section when contexts is empty', () => {
    const { user } = build({ diff: '+x', contexts: [], files: [], lang: 'ja' });
    expect(user).not.toContain('関連コンテキスト');
  });

  it('includes context section when contexts are present', () => {
    const contexts: NexusResult[] = [{ file: 'ctx.ts', content: 'some ctx body' }];
    const { user } = build({ diff: '+x', contexts, files: [], lang: 'ja' });
    expect(user).toContain('関連コンテキスト');
    expect(user).toContain('ctx.ts');
    expect(user).toContain('some ctx body');
  });

  it('appends hint when provided', () => {
    const { user } = build({
      diff: '+x',
      contexts: [],
      files: [],
      lang: 'ja',
      hint: 'もっと簡潔に',
    });
    expect(user).toContain('追加の指示');
    expect(user).toContain('もっと簡潔に');
  });

  it('omits hint section when hint is undefined', () => {
    const { user } = build({ diff: '+x', contexts: [], files: [], lang: 'ja' });
    expect(user).not.toContain('追加の指示');
  });

  it('strips ANSI escape sequences from diff', () => {
    const diff = '\x1b[32m+green\x1b[0m\n-\x1b[31mred\x1b[0m';
    const { user } = build({ diff, contexts: [], files: [], lang: 'ja' });
    expect(user).not.toContain(String.fromCharCode(27));
    expect(user).toContain('\n```diff\n+green\n-red\n```');
  });

  it('normalizes CRLF to LF in context content', () => {
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'line1\r\nline2\r\n' }];
    const { user } = build({ diff: '+x', contexts, files: [], lang: 'ja' });
    expect(user).not.toContain('\r');
    expect(user).toContain('line1\nline2');
  });

  it('handles diffs containing multiple backtick code fences', () => {
    const diff = '+const code = ` ```js\\n console.log("hi"); \\n ``` `;\n+const more = ` ```` `';
    const { user } = build({ diff, contexts: [], files: [], lang: 'ja' });
    expect(user).toContain('\n`````diff\n');
    expect(user).toContain('\n`````');
    expect(user).toContain(diff);
  });
});
