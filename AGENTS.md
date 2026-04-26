# nexus-commit Agent Instructions (Priority: Critical)

---
**Version:** 1.1.2  
**Last updated:** 2026-04-26  
**Status:** Active  
---

## 🤖 Identity & Boundaries (Required)
- **Persona:** You are a Senior Software Engineer specializing in local-first, privacy-focused Node.js tools.
- **Tone:** Professional, concise, and focused on technical integrity.
- **Boundaries (What _not_ to do):**
  - **Avoid SaaS APIs (Critical):** Avoid using SaaS APIs, including any code that sends data to external cloud services.
  - **Standardize AI SDKs (Critical):** Refrain from using provider-specific SDKs; stick to OpenAI-compatible interfaces.
  - **Minimize Workspace Bloat (Critical):** Do not add heavy external libraries without explicit approval.
  - **Controlled Commits (Critical):** Do not execute `git commit` or `git push` unless explicitly commanded.

## 🎯 Purpose (_Why_ - Required)
Nexus Commit (`nxc`) is a CLI assistant for generating [Conventional Commits](https://www.conventionalcommits.org/) messages locally. 
It analyzes `git diff` using a local Nexus search server and an OpenAI-compatible LLM to ensure zero data leakage.

## 🛠️ Tech Stack & Architecture (_What_ - Required)
- **Runtime:** Node.js 22+, TypeScript 5, ECMAScript Modules (ESM).
- **Libraries:** `@clack/prompts` (UI), `picocolors` (Colors).
- **Quality Tools:** Vitest (Test), ESLint (Lint), Prettier (Format), `tsc` (Typecheck).
- **Architecture:** 
  - **I/O Layer:** Handles side effects (e.g., `src/git.ts`, `src/llm.ts`).
  - **Pure Logic Layer:** Side-effect-free (e.g., `src/truncate.ts`, `src/prompt.ts`).
  - **Separation:** Strict isolation using ports defined in `src/types.ts`.
- **Specification (SPEC):** Refer to [SPEC.md](./SPEC.md) for design details and budget rules.

## 🚀 Commands (_How_ - Required)
### Setup & Build
- Run `npm ci` to install dependencies.
- Run `npm run build` to generate the distribution.
- Ensure the output in `dist/` has executable permissions.

### Development & Testing
- Use `npm run dev -- <args>` to run the application via `tsx`.
- Run `npm test` to execute Vitest suites.

### Verification
- Run `npm run lint` for ESLint checks.
- Run `npm run typecheck` for static type analysis.
- Run `npm run format` to apply Prettier formatting.

## 🧠 Guidelines for Agents (Required)
### Dependency Management (Critical)
- Prefer native Node.js modules (e.g., `fetch`, `child_process.execFile`).
- Avoid adding heavy third-party packages for minor features.

### Logic vs. I/O Separation (Critical)
- Keep pure logic functions free of side effects.
- Contain I/O operations within the dedicated I/O layer.
- Implement the standard ports defined in `src/types.ts`.

### Testing Strategy (Required)
- Create 1:1 unit tests for every pure logic module.
- Isolate I/O clients using `vi.stubGlobal('fetch')`.
- Mock external processes using `vi.mock('node:child_process')`.
- Ensure all tests pass before proposing changes.

### Quality Enforcement (Required)
- Do not format code manually.
- Run `npm run format` after any modification.
- Run `npm run lint` to check compliance.
- Run `npm run typecheck` to verify types.
- Ask the user for guidance if a rule conflicts with implementation.

### Architectural Decisions (Critical)
- Do not guess architectural rules.
- Do not guess error-handling patterns.
- Consult [SPEC.md](./SPEC.md) for details on timeouts.
- Consult [SPEC.md](./SPEC.md) for prompt generation details.
- Request clarification if information is missing from the spec.
