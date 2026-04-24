import type { NexusResult } from './types.js';

export interface TruncateInput {
  diff: string;
  contexts: NexusResult[];
  maxChars: number;
}

export interface TruncateOutput {
  diff: string;
  contexts: NexusResult[];
}

function truncateDiff(diff: string, budget: number): string {
  if (diff.length <= budget) {
    return diff;
  }
  if (budget <= 0) {
    return '';
  }

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

  while (blocks.length > 1 && blocks.join('\n').length > budget) {
    blocks.pop();
  }

  let result = blocks.join('\n');
  if (result.length > budget) {
    result = result.slice(0, budget);
  }

  return result;
}

function truncateContexts(contexts: NexusResult[], budget: number): NexusResult[] {
  if (contexts.length === 0) {
    return [];
  }

  let total = contexts.reduce((sum, context) => sum + context.content.length, 0);
  if (total <= budget) {
    return contexts;
  }

  const remaining = [...contexts];
  while (total > budget && remaining.length > 0) {
    const longest = remaining.reduce((prev, curr) =>
      curr.content.length > prev.content.length ? curr : prev,
    );

    const idx = remaining.indexOf(longest);
    if (idx !== -1) {
      remaining.splice(idx, 1);
    }
    total -= longest.content.length;
  }

  return remaining;
}

export function build({ diff, contexts, maxChars }: TruncateInput): TruncateOutput {
  const diffBudget = Math.floor(maxChars * 0.6);
  const contextBudget = maxChars - diffBudget;

  return {
    diff: truncateDiff(diff, diffBudget),
    contexts: truncateContexts(contexts, contextBudget),
  };
}
