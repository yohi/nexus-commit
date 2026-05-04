# nexus-commit Agent Instructions

## Project Context
This is a local-first CLI tool for generating [Conventional Commits](https://www.conventionalcommits.org/) messages using local LLMs and local Nexus index search, ensuring absolute code privacy (no data ever leaves the local environment).

## Tech Stack & Architecture
- **Runtime:** Node.js 22+ (ESM), TypeScript 5.
- **Core Libraries:** `@clack/prompts` (CLI UI), `picocolors`, `zod` (Validation), `js-tiktoken` (Tokenizer).
- **Architecture Pattern:** Strict separation between the **I/O Layer** (side-effects like git, LLM, Nexus APIs) and the **Pure Logic Layer** (side-effect-free, highly testable logic like truncation and prompt building). Isolation is achieved via interfaces.

## Critical Commands
- **Install:** `npm ci`
- **Build:** `npm run build`
- **Test:** `npm test`
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Format:** `npm run format:check` (fix with `npm run format`)

*Always run verification commands (`test`, `typecheck`, `lint`, `format:check`) before claiming completion or proposing changes.*

## Guidelines & Constraints
- **[CRITICAL] No SaaS/Cloud APIs:** Use local/self-hosted endpoints only.
- **[CRITICAL] Minimal Dependencies:** Prefer native Node.js APIs (e.g., `fetch`). Avoid provider-specific SDKs and heavy libraries. Use standard OpenAI `/v1/chat/completions` protocol.
- **[CRITICAL] Controlled Commits:** Do not run `git commit` or `git push` unless explicitly asked by the user.
- **Test-Driven:** Every pure logic module requires 1:1 unit tests. Mock I/O using `vi.stubGlobal('fetch')` or `vi.mock`.
- **Validation & Truncation:** Validate all external API responses using `zod` schemas. Always use `js-tiktoken` for token-aware truncation.

## Documentation Pointers
- For detailed specifications, token budget rules, prompt structures, and diagnostic (`--doctor`) logic, see `SPEC.md`.
- For user setup, global environment variables, and CLI usage, see `README.md`.
