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
  return Math.floor(maxTokens * TOKEN_SAFETY_MARGIN);
}

export function countTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  try {
    return getEncoder().encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

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
    const charBudget = budget * 4;
    return text.length <= charBudget ? text : text.slice(0, charBudget);
  }
}

export const PROMPT_SUFFIX_MAX_TOKENS = 1000;
