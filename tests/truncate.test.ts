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

  it('contexts が空なら diff に全予算 (effectiveBudget) を割り当てる', () => {
    const long = 'x '.repeat(2000);
    const diff = mkDiffBlock('a.ts', long);
    const out = build({ diff, contexts: [], maxTokens: 200 });
    // budget = 200 * 0.85 = 170
    const budget = effectiveBudget(200);
    expect(countTokens(out.diff)).toBeLessThanOrEqual(budget);
    // 以前の制限 (0.6 * 170 = 102) を超えていることを確認
    expect(countTokens(out.diff)).toBeGreaterThan(102);
  });

  it('diff が空なら contexts に全予算を割り当てる', () => {
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'x '.repeat(80) }];
    // budget = 200 * 0.85 = 170
    // 以前の制限 (0.4 * 170 = 68) なら削除されていたはず
    const out = build({ diff: '', contexts, maxTokens: 200 });
    expect(out.contexts).toHaveLength(1);
    expect(out.contexts[0]!.file).toBe('a.ts');
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
  }, 15000);

  it('handles empty diff', () => {
    const out = build({ diff: '', contexts: [], maxTokens: 100 });
    expect(out.diff).toBe('');
  });

  it('handles empty contexts', () => {
    const out = build({ diff: 'abc', contexts: [], maxTokens: 100 });
    expect(out.contexts).toEqual([]);
  });

  it('ヘッダー自体が予算を超える場合にヘッダーを切り詰める', () => {
    const budget = effectiveBudget(20); // budget = 17
    const longHeader = 'diff --git a/' + 'x'.repeat(50) + ' b/' + 'x'.repeat(50);
    const out = build({ diff: longHeader, contexts: [], maxTokens: 20 });
    expect(countTokens(out.diff)).toBeLessThanOrEqual(budget);
    expect(out.diff.length).toBeGreaterThan(0);
  });

  it('diff の余剰予算を contexts に再分配する', () => {
    // maxTokens: 100 -> effectiveBudget = 85
    // diffBudget (60%) = floor(85 * 0.6) = 51
    // contextBudget (40%) = 85 - 51 = 34
    const diff = 'small diff';
    const diffTokens = countTokens(diff); // 2 tokens
    const initialContextBudget = 34;

    const content = 'x '.repeat(35);
    const contextTokens = countTokens(content); // 70 tokens

    // 1. 再分配前の予算 (34) では収まらないことを確認
    expect(contextTokens).toBeGreaterThan(initialContextBudget);

    const contexts: NexusResult[] = [{ file: 'a.ts', content }];
    const out = build({ diff, contexts, maxTokens: 100 });

    // 2. 再分配後の予算 (34 + (51 - 2) = 83) に収まっていることを確認
    const redistributedBudget = initialContextBudget + (51 - diffTokens);
    expect(contextTokens).toBeLessThanOrEqual(redistributedBudget);

    // 3. 再分配のおかげでコンテキストが保持されていることを検証
    expect(out.contexts).toHaveLength(1);
    expect(out.contexts[0]!.file).toBe('a.ts');
    expect(countTokens(out.contexts[0]!.content)).toBe(contextTokens);
  });
});
