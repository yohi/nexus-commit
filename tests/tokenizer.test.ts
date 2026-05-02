import { describe, expect, it } from 'vitest';
import {
  countTokens,
  truncateToTokens,
  effectiveBudget,
  TOKEN_SAFETY_MARGIN,
  PROMPT_SUFFIX_MAX_TOKENS,
} from '../src/tokenizer.js';

describe('countTokens', () => {
  it('空文字は 0', () => {
    expect(countTokens('')).toBe(0);
  });

  it('英文の token 数は文字数より小さい (BPE 結合)', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const n = countTokens(text);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(text.length);
  });

  it('日本語も計測できる', () => {
    expect(countTokens('こんにちは、世界。')).toBeGreaterThan(0);
  });
});

describe('truncateToTokens', () => {
  it('budget 0 は空文字を返す', () => {
    expect(truncateToTokens('hello world', 0)).toBe('');
  });

  it('budget が token 数を上回るときは元の文字列を返す', () => {
    const text = 'hello';
    const n = countTokens(text);
    expect(truncateToTokens(text, n + 5)).toBe(text);
  });

  it('budget 内の token 数に切り詰める', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    const truncated = truncateToTokens(text, 10);
    expect(countTokens(truncated)).toBeLessThanOrEqual(10);
    expect(truncated.length).toBeLessThan(text.length);
  });
});

describe('effectiveBudget', () => {
  it('TOKEN_SAFETY_MARGIN を反映する', () => {
    expect(TOKEN_SAFETY_MARGIN).toBeCloseTo(0.85);
    expect(effectiveBudget(1000)).toBe(Math.floor(1000 * 0.85));
    expect(effectiveBudget(8192)).toBe(Math.floor(8192 * 0.85));
  });

  it('0 入力は 0', () => {
    expect(effectiveBudget(0)).toBe(0);
  });
});

describe('PROMPT_SUFFIX_MAX_TOKENS', () => {
  it('1000 で公開されている', () => {
    expect(PROMPT_SUFFIX_MAX_TOKENS).toBe(1000);
  });
});
