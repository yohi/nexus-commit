import { countTokens, effectiveBudget, truncateToTokens } from './tokenizer.js';
import type { NexusResult } from './types.js';

export interface TruncateInput {
  diff: string;
  contexts: NexusResult[];
  maxTokens: number;
}

export interface TruncateOutput {
  diff: string;
  contexts: NexusResult[];
}

function splitDiffBlocks(diff: string): string[] {
  const lines = diff.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
      }
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

function truncateDiffByTokens(diff: string, budget: number): string {
  if (budget <= 0) {
    return '';
  }
  if (countTokens(diff) <= budget) {
    return diff;
  }

  const blocks = splitDiffBlocks(diff);
  if (blocks.length === 0) {
    return '';
  }

  const blockTokens = blocks.map((b) => countTokens(b));
  // join('\n') adds (blocks.length - 1) newlines.
  // Each newline is 1 token.
  let total = blockTokens.reduce((s, t) => s + t, 0) + Math.max(0, blocks.length - 1);

  while (blocks.length > 1 && total > budget) {
    const lastTokens = blockTokens.pop();
    blocks.pop();
    if (lastTokens !== undefined) {
      // Subtract the tokens of the block and the newline that was before it.
      total -= lastTokens + 1;
    }
  }

  let joined = blocks.join('\n');
  if (total <= budget) {
    return joined;
  }

  const last = blocks[blocks.length - 1];
  if (last === undefined) {
    return '';
  }
  const newlineIdx = last.indexOf('\n');
  const header = newlineIdx === -1 ? last : last.slice(0, newlineIdx + 1);
  const body = newlineIdx === -1 ? '' : last.slice(newlineIdx + 1);

  const headerTokens = countTokens(header);
  if (headerTokens >= budget) {
    blocks[blocks.length - 1] = truncateToTokens(header, budget);
  } else {
    const remainingBudget = budget - headerTokens;
    const truncatedBody = truncateToTokens(body, remainingBudget);
    blocks[blocks.length - 1] = header + truncatedBody;
  }
  joined = blocks.join('\n');
  return joined;
}

function truncateContextsByTokens(contexts: NexusResult[], budget: number): NexusResult[] {
  if (contexts.length === 0) {
    return [];
  }

  const tokenMap = new Map<NexusResult, number>();
  let total = 0;
  for (const c of contexts) {
    const t = countTokens(c.content);
    tokenMap.set(c, t);
    total += t;
  }

  if (total <= budget) {
    return contexts;
  }

  const remaining = [...contexts];
  while (total > budget && remaining.length > 0) {
    let longestIdx = 0;
    let longestTokens = -1;

    for (const [i, context] of remaining.entries()) {
      const tokens = tokenMap.get(context) ?? 0;
      if (tokens > longestTokens) {
        longestIdx = i;
        longestTokens = tokens;
      }
    }

    total -= longestTokens;
    remaining.splice(longestIdx, 1);
  }

  return remaining;
}

export function build({ diff, contexts, maxTokens }: TruncateInput): TruncateOutput {
  const budget = effectiveBudget(maxTokens);

  let diffBudget: number;
  let contextBudget: number;

  if (contexts.length === 0) {
    diffBudget = budget;
    contextBudget = 0;
  } else if (diff === '') {
    diffBudget = 0;
    contextBudget = budget;
  } else {
    diffBudget = Math.floor(budget * 0.6);
    contextBudget = budget - diffBudget;
  }

  return {
    diff: truncateDiffByTokens(diff, diffBudget),
    contexts: truncateContextsByTokens(contexts, contextBudget),
  };
}
