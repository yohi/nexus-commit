import { getEncoding, type Tiktoken } from 'js-tiktoken';

let encoderCache: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (encoderCache === null) {
    encoderCache = getEncoding('cl100k_base');
  }
  return encoderCache;
}

export const TOKEN_SAFETY_MARGIN = 0.85;

export function effectiveBudget(maxTokens: number): number {
  if (maxTokens <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor(maxTokens * TOKEN_SAFETY_MARGIN));
}

export function countTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  try {
    return getEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

/**
 * 文字列をトークン数で切り詰めます。
 * 注意: トークン境界で切り詰めるため、マルチバイト文字の途中で切断され、
 * デコード結果に文字化け (U+FFFD) が生じる可能性があります。
 *
 * @param text 切り詰め対象の文字列
 * @param budget トークン予算
 * @returns 切り詰められた文字列。失敗した場合は空文字を返します（Fail Closed）。
 */
export function truncateToTokens(text: string, budget: number): string {
  if (budget <= 0 || text.length === 0) {
    return '';
  }
  try {
    const encoder = getEncoder();
    const tokens = encoder.encode(text);
    if (tokens.length <= budget) {
      return text;
    }
    return encoder.decode(tokens.slice(0, budget));
  } catch {
    return '';
  }
}

export const PROMPT_SUFFIX_MAX_TOKENS = 1000;
