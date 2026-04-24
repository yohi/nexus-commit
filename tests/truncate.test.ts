import { describe, it, expect } from 'vitest';
import { build } from '../src/truncate.js';
import type { NexusResult } from '../src/types.js';

const mkDiff = (blocks: string[]): string =>
  blocks
    .map((b) => {
      const prefix = b.slice(0, 4);
      return 'diff --git a/' + prefix + '.ts b/' + prefix + '.ts\n' + b;
    })
    .join('\n');

describe('truncate.build', () => {
  it('returns input unchanged when within budget', () => {
    const diff = mkDiff(['small content here']);
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'ctx' }];
    const out = build({ diff, contexts, maxChars: 10000 });
    expect(out.diff).toBe(diff);
    expect(out.contexts).toEqual(contexts);
  });

  it('caps diff to 60% of maxChars', () => {
    const diff = mkDiff(['x'.repeat(1000)]);
    const out = build({ diff, contexts: [], maxChars: 100 });
    expect(out.diff.length).toBeLessThanOrEqual(60);
  });

  it('drops trailing blocks first, keeping earliest diff --git header', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      'content-A'.repeat(20),
      'diff --git a/b.ts b/b.ts',
      'content-B'.repeat(20),
    ].join('\n');
    const out = build({ diff, contexts: [], maxChars: 300 });
    expect(out.diff).toContain('diff --git a/a.ts b/a.ts');
    expect(out.diff).not.toContain('diff --git a/b.ts b/b.ts');
  });

  it('removes longest context first on overflow', () => {
    const contexts: NexusResult[] = [
      { file: 'short.ts', content: 'tiny' },
      { file: 'huge.ts', content: 'x'.repeat(500) },
    ];
    const out = build({ diff: '', contexts, maxChars: 200 });
    expect(out.contexts.some((c) => c.file === 'huge.ts')).toBe(false);
    expect(out.contexts.some((c) => c.file === 'short.ts')).toBe(true);
  });

  it('returns empty context array when all exceed budget', () => {
    const contexts: NexusResult[] = [
      { file: 'a.ts', content: 'x'.repeat(500) },
      { file: 'b.ts', content: 'y'.repeat(500) },
    ];
    const out = build({ diff: '', contexts, maxChars: 100 });
    expect(out.contexts).toEqual([]);
  });

  it('handles empty contexts', () => {
    const out = build({ diff: 'diff content', contexts: [], maxChars: 1000 });
    expect(out.contexts).toEqual([]);
  });

  it('handles empty diff', () => {
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'ctx' }];
    const out = build({ diff: '', contexts, maxChars: 100 });
    expect(out.diff).toBe('');
    expect(out.contexts).toEqual(contexts);
  });
});
