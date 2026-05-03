# Code Review Fixes Design

## Goal
Address four code review issues related to performance, UX, and test coverage.

## Approach

### 1. Performance Optimization for Diff Truncation
- **File**: `src/truncate.ts`
- **Current**: $O(N^2)$ due to repeated `join` and `countTokens` in a loop.
- **New**: $O(N)$ by pre-calculating token counts for each block and using a running total.
- **Precision**: Account for `\n` characters added by `join('\n')` assuming 1 token per newline.

### 2. Performance Optimization for Context Truncation
- **File**: `src/truncate.ts`
- **Current**: $O(M^2)$ due to repeated `countTokens` for all remaining contexts in each iteration.
- **New**: $O(M)$ by caching token counts in a `Map`.

### 3. Clearer Warning for Deprecated Env Var
- **File**: `src/config.ts`
- **Change**: Explicitly state that `NEXUS_COMMIT_MAX_CHARS` value is ignored.

### 4. Edge Case Test Coverage
- **File**: `tests/truncate.test.ts`
- **Add**: Tests for empty `diff` string and empty `contexts` array.

## Verification Plan
- Run existing tests to ensure no regressions.
- Add new tests and ensure they pass.
- Manual check of the warning message by setting the environment variable.
