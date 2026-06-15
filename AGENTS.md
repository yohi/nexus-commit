# AI Agent Instructions for nexus-commit

Welcome, AI Agent! This file (`AGENTS.md`) provides critical context, boundaries, and conventions for working effectively within the `nexus-commit` repository. Please read this entirely before initiating any codebase changes or tool executions.

## 🎯 Project Intent

**nexus-commit (`nxc`)** is a privacy-first, local CLI tool for generating [Conventional Commits](https://www.conventionalcommits.org/) messages. It combines `git diff` with contextual awareness from a local Nexus index server and generates the final message using local LLMs (like Ollama).

**Core Philosophy:**
- **Zero Data Exfiltration:** No data ever leaves the local environment. Absolute code privacy is paramount.
- **Dependency Minimalism:** We favor native Node.js APIs (e.g., `fetch`, `node:child_process`) over heavy SDKs.
- **Robustness:** Graceful fallbacks are required. If Nexus is down or the LLM times out, the CLI must handle it elegantly (or fail with a clear exit code) without crashing the user's terminal.

## 🧱 Architecture & Architecture Boundaries

- **Runtime Constraints:** Node.js >= 22 (ESM only), TypeScript 5. (Note: The auto-started Nexus daemon requires Node.js >= 24).
- **Layer Separation (CRITICAL):**
  - **I/O Layer:** Code interacting with external systems (git, LLM APIs, Nexus HTTP API, File System). Located primarily in `nexus-client.ts`, `llm.ts`, `git.ts`, `prompt-file.ts`, `nexus-daemon.ts`, `nexus-spawn.ts`.
  - **Pure Logic Layer:** Side-effect-free, easily testable logic. Located primarily in `truncate.ts`, `prompt.ts`, `keywords.ts`, `schemas.ts`, `daemon-state.ts`.
  - **Boundary Rule:** Never mix I/O with Pure Logic. Use Dependency Injection (interfaces defined in `types.ts`) when connecting the two in the main entry point (`nxc.ts`).

## 🛑 Strict Agent Boundaries (Do Not Cross)

1. **No External SaaS Calls:** Do not implement or suggest integrations with cloud-based LLMs (like OpenAI, Anthropic) or external telemetry services.
2. **No Unprompted Git Actions:** Do NOT run `git commit`, `git push`, or alter the git history/staging area unless explicitly instructed by the human user.
3. **Preserve Fallbacks:** Never break the graceful fallback mechanism. If an API call fails, it must be caught and handled gracefully (e.g., continuing without context).

## 🛠 Tech Stack & Core Libraries

- **CLI UI:** `@clack/prompts`, `picocolors`
- **Validation:** `zod` (Use `.passthrough()` for external APIs to maintain forward compatibility).
- **Tokenization:** `js-tiktoken` (Strictly `cl100k_base` encoding, applied with an 0.85 safety margin).
- **Testing:** `vitest`

## ⚙️ Development Workflows & Commands

Before declaring a task complete, you MUST ensure that all checks pass.

- **Setup:** `npm ci`
- **Build:** `npm run build` (Ensures `dist/` is updated and shebangs are preserved).
- **Testing:** `npm run test` (Unit tests MUST be added for new Pure Logic functions).
- **Lint & Format:** `npm run lint` & `npm run format:check` (Auto-fix with `npm run format`).
- **Type Checking:** `npm run typecheck`

## 🧪 Testing Strategy

- **Pure Logic:** Aim for 100% coverage. Write simple input/output assertions.
- **I/O Logic:** Use `vi.stubGlobal('fetch')`, `vi.mock('node:child_process')`, or `vi.mock('node:fs')` to mock side effects. Do not make real network requests in tests.

## 📚 Key Reference Documents

- **[README.md](./README.md):** User-facing documentation, setup, global environment variables, and CLI flag usage.
- **[SPEC.md](./SPEC.md):** Detailed technical specifications, ADRs (Architecture Decision Records), token budget algorithms, and the daemon autostart lifecycle.
