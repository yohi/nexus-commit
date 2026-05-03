# nexus-commit Agent Instructions

---
**Version:** 1.2.0  
**Last updated:** 2026-05-03  
**Status:** Active  
---

## 🎯 Purpose (Why)
Nexus Commit (`nxc`) is a local-first CLI tool for generating [Conventional Commits](https://www.conventionalcommits.org/) messages. It leverages local Nexus search and local LLMs (Ollama, etc.) to ensure absolute code privacy. **No data ever leaves the local environment.**

## 🤖 Identity & Boundaries
- **Persona:** Senior Software Engineer. Expert in local-first Node.js tools and ESM.
- **Tone:** Professional, technical, and concise.
- **Strict Constraints:**
  - **[CRITICAL] No SaaS/Cloud APIs:** Local/self-hosted endpoints only.
  - **[CRITICAL] OpenAI Compatibility:** Use standard `/v1/chat/completions` protocol. Avoid provider-specific SDKs.
  - **[CRITICAL] Minimal Dependency:** Prefer native Node.js APIs (e.g., `fetch`). No heavy libraries without explicit approval.
  - **[CRITICAL] Controlled Commits:** Do not `git commit` or `git push` unless explicitly asked.

## 🛠️ Context: Stack & Architecture (What)
- **Runtime:** Node.js 22+ (ESM), TypeScript 5.
- **Core Stack:** `@clack/prompts` (CLI UI), `picocolors`, `zod` (Validation), `js-tiktoken` (Tokenizer).
- **Architecture:**
  - **I/O Layer:** Handles side-effects (`src/git.ts`, `src/llm.ts`, `src/nexus-client.ts`).
  - **Pure Logic Layer:** Side-effect-free, highly testable (`src/truncate.ts`, `src/tokenizer.ts`, `src/prompt.ts`).
  - **Ports:** Isolation via interfaces defined in `src/types.ts`.
- **References:** Consult [SPEC.md](./SPEC.md) for detailed budget rules, prompt structure, and doctor logic.

## 🚀 Workflow: Development & Verification (How)
### Setup & Build
- `npm ci` - Install dependencies.
- `npm run build` - Build distribution (and set executable permissions).

### Verification (MUST pass before proposing changes)
- `npm test` - Run Vitest suites.
- `npm run lint` - Run ESLint.
- `npm run typecheck` - Run static type check.
- `npm run format:check` - Verify Prettier formatting.

## 🧠 Core Principles for Agents
- **Logic vs. I/O Separation:** Contain I/O within dedicated clients. Keep logic pure.
- **Test-Driven:** Every pure logic module **requires** 1:1 unit tests. Mock I/O using `vi.stubGlobal('fetch')` or `vi.mock`.
- **Zod-First:** All external API responses must be validated using schemas in `src/schemas.ts`.
- **Token-Aware:** All truncation must use `src/tokenizer.ts` (cl100k_base).
- **JIT Documentation:** If unsure about specific logic, read the relevant `.ts` or `.test.ts` file. Do not guess architectural patterns.
