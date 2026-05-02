import { describe, expect, it, vi } from 'vitest';

// モジュールが読み込まれる前にモックを設定
vi.mock('js-tiktoken', () => {
  return {
    getEncoding: vi.fn().mockReturnValue({
      encode: () => {
        throw new Error('Mock Encode Fail');
      },
      decode: () => {
        throw new Error('Mock Decode Fail');
      },
    }),
  };
});

// モック設定後にインポート
import { countTokens, truncateToTokens } from '../src/tokenizer.js';

describe('tokenizer error handling fallback', () => {
  it('countTokens: encoder が失敗した際に文字数を返す', () => {
    const text = 'hello world';
    expect(countTokens(text)).toBe(text.length);
  });

  it('truncateToTokens: encoder が失敗した際に空文字を返す (Fail Closed)', () => {
    expect(truncateToTokens('hello world', 5)).toBe('');
  });
});
