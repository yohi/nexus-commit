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
  if (countTokens(joined) <= budget) {
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
  const remainingBudget = budget - headerTokens;
  const truncatedBody = remainingBudget > 0 ? truncateToTokens(body, remainingBudget) : '';

  blocks[blocks.length - 1] = header + truncatedBody;
  joined = blocks.join('\n');
  return joined;
}

function truncateContextsByTokens(contexts: NexusResult[], budget: number): NexusResult[] {
  if (contexts.length === 0) {
    return [];
  }

  let total = contexts.reduce((sum, context) => sum + countTokens(context.content), 0);
  if (total <= budget) {
    return contexts;
  }

  const remaining = [...contexts];
  while (total > budget && remaining.length > 0) {
    let longestIdx = 0;
    let longestTokens = -1;
    let idx = 0;

    for (const context of remaining) {
      const tokens = countTokens(context.content);
      if (tokens > longestTokens) {
        longestIdx = idx;
        longestTokens = tokens;
      }
      idx += 1;
    }

    remaining.splice(longestIdx, 1);
    total -= longestTokens;
  }

  return remaining;
}

export function build({ diff, contexts, maxTokens }: TruncateInput): TruncateOutput {
  const budget = effectiveBudget(maxTokens);
  const diffBudget = Math.floor(budget * 0.6);
  const contextBudget = budget - diffBudget;

  return {
    diff: truncateDiffByTokens(diff, diffBudget),
    contexts: truncateContextsByTokens(contexts, contextBudget),
  };
}
