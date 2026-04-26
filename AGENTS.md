# nexus-commit

## 🎯 Purpose (WHY)
Nexus Commit (`nxc`) is an AI-powered CLI assistant that generates Conventional Commits messages entirely locally. It combines `git diff` with contextual information from a local Nexus search server and sends them to a local OpenAI-compatible LLM. Zero data is sent to external SaaS.

## 🛠️ Tech Stack & Architecture (WHAT)
- **Runtime:** Node.js 22+, TypeScript 5, ESM
- **Libraries:** `@clack/prompts` (interactive UI), `picocolors` (styling)
- **Testing & Quality:** Vitest, ESLint (flat config), Prettier, `tsc` (typecheck)
- **Architecture:** Strict separation between I/O layer (`src/git.ts`, `src/nexus-client.ts`, `src/llm.ts`) and pure logic layer (`src/keywords.ts`, `src/truncate.ts`, `src/prompt.ts`, `src/config.ts`, `src/flags.ts`). I/O clients use native `fetch` or `child_process.execFile` (no heavy dependencies).
- **Specs:** Refer to [SPEC.md](./SPEC.md) for detailed design decisions, fallback behaviors, and text budget allocation rules.

## 🚀 Commands (HOW)
- **Install:** `npm ci`
- **Build:** `npm run build` (outputs to `dist/`, ensures executable permissions)
- **Dev:** `npm run dev -- <args>` (runs `nxc` via `tsx`)
- **Test:** `npm test` (runs Vitest)
- **Code Quality:** `npm run lint` (ESLint), `npm run typecheck` (tsc), `npm run format` (Prettier)

## 🧠 Guidelines for Agents
- **No Heavy Dependencies:** Do not add heavy external libraries for simple tasks. We use native `fetch` and `execFile` where possible.
- **Pure Logic vs. I/O:** When adding features, ensure pure logic functions remain free of side effects. I/O operations must be contained in the I/O layer and implement the ports defined in `src/types.ts`.
- **Testing Strategy:** 
  - Pure logic modules must have 1:1 unit tests.
  - I/O clients must use `vi.stubGlobal('fetch')` or `vi.mock('node:child_process')` to isolate side effects.
- **Linting & Formatting:** Do not manually format code. Always run `npm run format`, `npm run lint`, and `npm run typecheck` after modifications to ensure compliance with project rules.
- **Detailed Specifications:** Do not try to guess architectural rules. When in doubt about error handling, timeouts, or the prompt generation process, consult `SPEC.md`.
