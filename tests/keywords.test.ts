import { describe, it, expect } from 'vitest';
import { extract } from '../src/keywords.js';

const sampleDiff = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index 111..222 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,3 +1,5 @@',
  '-const oldFunction = () => {};',
  '+const newHandler = () => {};',
  '+const myService = new MyService();',
  '+myService.initialize();',
  '+myService.initialize();',
].join('\n');

describe('extract', () => {
  it('picks identifiers from added lines only', () => {
    const kw = extract(sampleDiff);
    expect(kw).toContain('newHandler');
    expect(kw).toContain('myService');
    expect(kw).toContain('MyService');
    expect(kw).toContain('initialize');
  });

  it('ignores identifiers from removed lines', () => {
    const kw = extract(sampleDiff);
    expect(kw).not.toContain('oldFunction');
  });

  it('ignores the +++ header line', () => {
    const diff = '+++ b/src/SecretHeader.ts\n+const realToken = 1;';
    const kw = extract(diff);
    expect(kw).not.toContain('SecretHeader');
    expect(kw).toContain('realToken');
  });

  it('sorts by frequency descending (initialize twice before newHandler once)', () => {
    const kw = extract(sampleDiff);
    expect(kw.indexOf('initialize')).toBeLessThan(kw.indexOf('newHandler'));
  });

  it('excludes TypeScript reserved keywords', () => {
    const diff = [
      '+const x = 1;',
      '+function fn() { return x; }',
      '+class Foo {}',
      '+import { bar } from "./bar";',
    ].join('\n');
    const kw = extract(diff);
    expect(kw).not.toContain('const');
    expect(kw).not.toContain('function');
    expect(kw).not.toContain('class');
    expect(kw).not.toContain('import');
    expect(kw).not.toContain('from');
    expect(kw).not.toContain('return');
    expect(kw).toContain('fn');
    expect(kw).toContain('Foo');
    expect(kw).toContain('bar');
  });

  it('respects the limit argument', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `+const token${i} = ${i};`);
    const diff = lines.join('\n');
    expect(extract(diff, 10).length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for empty diff', () => {
    expect(extract('')).toEqual([]);
  });

  it('ignores identifiers shorter than 3 chars', () => {
    const diff = '+const a = 1; const ab = 2; const abc = 3;';
    const kw = extract(diff);
    expect(kw).not.toContain('a');
    expect(kw).not.toContain('ab');
    expect(kw).toContain('abc');
  });

  it('allows 2-char identifiers followed by a call-pattern', () => {
    const diff = '+const ab = 1; fn();';
    const kw = extract(diff);
    expect(kw).toContain('fn');
    expect(kw).not.toContain('ab');
  });
});
