# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve performance of truncation logic, clarify configuration warnings, and restore edge case tests.

**Architecture:** Refactor `src/truncate.ts` to use pre-calculated token counts ($O(N)$), update `src/config.ts` string, and add test cases to `tests/truncate.test.ts`.

**Tech Stack:** TypeScript, Vitest, Tiktoken

---

### Task 1: Add Edge Case Tests (Issue 4)

**Files:**
- Modify: `tests/truncate.test.ts`

- [ ] **Step 1: Add empty diff and empty contexts tests**

```typescript
  it('handles empty diff', () => {
    const out = build({ diff: '', contexts: [], maxTokens: 100 });
    expect(out.diff).toBe('');
  });

  it('handles empty contexts', () => {
    const out = build({ diff: 'abc', contexts: [], maxTokens: 100 });
    expect(out.contexts).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test tests/truncate.test.ts`
Expected: PASS (The logic currently handles these, but tests were missing)

- [ ] **Step 3: Commit**

```bash
git add tests/truncate.test.ts
git commit -m "test: add edge case tests for empty diff and contexts"
```

---

### Task 2: Optimize Diff Truncation Performance (Issue 1)

**Files:**
- Modify: `src/truncate.ts:44-58`

- [ ] **Step 1: Implement $O(N)$ logic in `truncateDiffByTokens`**

```typescript
  const blockTokens = blocks.map((b) => countTokens(b));
  // join('\n') adds (blocks.length - 1) newlines
  let total = blockTokens.reduce((s, t) => s + t, 0) + Math.max(0, blocks.length - 1);

  while (blocks.length > 1 && total > budget) {
    const lastTokens = blockTokens.pop();
    blocks.pop();
    if (lastTokens !== undefined) {
      // Subtract the block tokens and the newline that was before it
      total -= lastTokens + 1;
    }
  }
```

- [ ] **Step 2: Run tests to verify correctness**

Run: `npm test tests/truncate.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/truncate.ts
git commit -m "perf: optimize diff truncation complexity to O(N)"
```

---

### Task 3: Optimize Context Truncation Performance (Issue 2)

**Files:**
- Modify: `src/truncate.ts:80-106`

- [ ] **Step 1: Implement $O(M)$ logic in `truncateContextsByTokens`**

```typescript
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

    for (let i = 0; i < remaining.length; i++) {
      const tokens = tokenMap.get(remaining[i])!;
      if (tokens > longestTokens) {
        longestIdx = i;
        longestTokens = tokens;
      }
    }

    total -= longestTokens;
    remaining.splice(longestIdx, 1);
  }
```

- [ ] **Step 2: Run tests to verify correctness**

Run: `npm test tests/truncate.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/truncate.ts
git commit -m "perf: optimize context truncation complexity to O(M)"
```

---

### Task 4: Clarify Deprecation Warning (Issue 3)

**Files:**
- Modify: `src/config.ts:43-47`

- [ ] **Step 1: Update the warning message**

```typescript
  if (env.NEXUS_COMMIT_MAX_CHARS !== undefined) {
    process.stderr.write(
      '[nxc] 警告: NEXUS_COMMIT_MAX_CHARS は廃止されました。設定値は無視され、デフォルト値が使用されます。 NEXUS_COMMIT_MAX_TOKENS を使用してください。\n',
    );
  }
```

- [ ] **Step 2: Verify by running config tests**

Run: `npm test tests/config.test.ts`
Expected: PASS (assuming existing tests don't strictly match the string, or update them if they do)

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "chore: clarify NEXUS_COMMIT_MAX_CHARS deprecation warning"
```
