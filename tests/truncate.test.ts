import { describe, expect, it } from 'vitest';
import { build } from '../src/truncate.js';
import { countTokens, effectiveBudget } from '../src/tokenizer.js';
import type { NexusResult } from '../src/types.js';

const mkDiffBlock = (file: string, body: string): string =>
  `diff --git a/${file} b/${file}\n${body}`;

describe('truncate.build (token-aware)', () => {
  it('budget 内ならそのまま返す', () => {
    const diff = mkDiffBlock('a.ts', 'small change');
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'ctx' }];
    const out = build({ diff, contexts, maxTokens: 8192 });
    expect(out.diff).toBe(diff);
    expect(out.contexts).toEqual(contexts);
  });

  it('diff の token 数を effectiveBudget * 0.6 以下に抑える', () => {
    const long = 'x '.repeat(2000);
    const diff = mkDiffBlock('a.ts', long);
    const out = build({ diff, contexts: [], maxTokens: 200 });
    const expectedMax = Math.floor(effectiveBudget(200) * 0.6);
    expect(countTokens(out.diff)).toBeLessThanOrEqual(expectedMax);
  });

  it('複数 diff block のうち末尾を先に削除する', () => {
    const diff = [
      mkDiffBlock('a.ts', 'A '.repeat(100)),
      mkDiffBlock('b.ts', 'B '.repeat(100)),
    ].join('\n');
    const out = build({ diff, contexts: [], maxTokens: 150 });
    expect(out.diff).toContain('diff --git a/a.ts');
    expect(out.diff).not.toContain('diff --git a/b.ts');
  });

  it('context は token 数の長い順に削除する', () => {
    const contexts: NexusResult[] = [
      { file: 'short.ts', content: 'tiny' },
      { file: 'huge.ts', content: 'lorem ipsum '.repeat(200) },
    ];
    const out = build({ diff: '', contexts, maxTokens: 100 });
    expect(out.contexts.some((c) => c.file === 'huge.ts')).toBe(false);
    expect(out.contexts.some((c) => c.file === 'short.ts')).toBe(true);
  });

  it('context すべてが budget 超なら空配列', () => {
    const contexts: NexusResult[] = [
      { file: 'a.ts', content: 'x '.repeat(500) },
      { file: 'b.ts', content: 'y '.repeat(500) },
    ];
    const out = build({ diff: '', contexts, maxTokens: 50 });
    expect(out.contexts).toEqual([]);
  });

  it('diff 単一巨大行でも diff --git ヘッダは保持する', () => {
    const diff = mkDiffBlock('huge.ts', 'a'.repeat(3000));
    const out = build({ diff, contexts: [], maxTokens: 100 });
    expect(out.diff.startsWith('diff --git a/huge.ts')).toBe(true);
  });
});
