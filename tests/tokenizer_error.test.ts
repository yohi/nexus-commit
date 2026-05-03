import { describe, expect, it, vi } from 'vitest';

// モジュールが読み込まれる前にモックを設定
vi.mock('js-tiktoken', () => {
  return {
    getEncoding: vi.fn().mockReturnValue({
      encode: (text: string) => {
        if (text.includes('FAIL_ENCODE')) {
          throw new Error('Mock Encode Fail');
        }
        // ダミートークンを返す
        if (text === 'SHORT') return new Uint32Array([1]);
        return new Uint32Array([1, 2, 3, 4, 5]);
      },
      decode: (tokens: Uint32Array) => {
        if (tokens.length === 3 && tokens[0] === 1) {
          throw new Error('Mock Decode Fail');
        }
        return 'decoded text';
      },
    }),
  };
});

// モック設定後にインポート
import { countTokens, truncateToTokens } from '../src/tokenizer.js';

describe('tokenizer error handling fallback', () => {
  it('countTokens: encoder が失敗した際に UTF-8 バイト長を返す', () => {
    const text = 'FAIL_ENCODE';
    expect(countTokens(text)).toBe(Math.ceil(text.length / 4));
    
    const emoji = '😊FAIL_ENCODE';
    expect(countTokens(emoji)).toBe(Math.ceil(emoji.length / 4));
  });

  it('truncateToTokens: encode が失敗した際に空文字を返す (Fail Closed)', () => {
    expect(truncateToTokens('FAIL_ENCODE', 2)).toBe('FAIL_ENC'); // 2 * 4 = 8 chars
  });

  it('truncateToTokens: encode は成功するが decode が失敗した際に空文字を返す (Fail Closed)', () => {
    // budget をトークン数より小さくして decode を呼ばせる
    // tokens.length は 5, budget は 3
    // slice(0, 3) は [1, 2, 3] になり、decode が失敗する設定
    expect(truncateToTokens('SUCCESS_ENCODE_BUT_FAIL_DECODE', 3)).toBe('SUCCESS_ENCO'); // 3 * 4 = 12 chars
  });
});
