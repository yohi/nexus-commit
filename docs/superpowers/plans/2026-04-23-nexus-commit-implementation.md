# Nexus Commit (`nxc`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設計書 `docs/superpowers/specs/2026-04-23-nexus-commit-design.md` に基づき、`git diff` + Nexus コンテキスト + ローカル LLM を組み合わせて Conventional Commits 準拠のメッセージを生成する `nxc` CLI を実装する。

**Architecture:** Node.js 22 / TypeScript 5 / ESM の単一プロセス CLI。I/O 層（git / Nexus / LLM / ターミナル）と純粋ロジック層（keywords / truncate / prompt / config / flags）を厳密に分離する。I/O はインターフェース定義 + DI で注入し、テストでは fake に差し替える。巨大依存は排除し、HTTP はネイティブ `fetch`、git は `child_process.execFile` のみを使用する。

**Tech Stack:** Node.js 22 / TypeScript 5 / `@clack/prompts` / `picocolors` / Vitest / ESLint (flat config) / Prettier / GitHub Actions (CI)

---

## Branching & PR Strategy

プロジェクトの Git 運用ルール：

1. **Phase ブランチ**は常に `master` から派生し、`master` をベースとした Draft PR を作成する。前 Phase が `master` にマージされるまで次 Phase には進まない。
   - 命名規則: `feature/phase-N__[機能名]__base`
2. **Task ブランチ**は直前 Task ブランチから派生（前 Task の PR マージを待たない）し、所属 Phase ブランチをベースとした Draft PR を作成する。
   - 命名規則: `feature/phaseN-taskM__[タスク名]`

| Phase | ブランチ | ベース | 概要 |
|---|---|---|---|
| 0 | `feature/phase-0__ci-cd__base` | `master` | GitHub Actions CI ワークフロー |
| 1 | `feature/phase-1__project-scaffold__base` | `master` | package.json / tsconfig / lint / test / DevContainer |
| 2 | `feature/phase-2__pure-logic__base` | `master` | 純粋ロジック（types, flags, config, logger, keywords, truncate, prompt） |
| 3 | `feature/phase-3__io-clients__base` | `master` | I/O クライアント（git, nexus-client, llm） |
| 4 | `feature/phase-4__cli-entrypoint__base` | `master` | `src/bin/nxc.ts` + 対話フロー + 受け入れ基準検証 |

---

## File Structure（最終成果物）

```text
nexus-commit/
├── .devcontainer/
│   ├── Dockerfile
│   └── devcontainer.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── bin/nxc.ts          # エントリポイント（shebang + 対話フロー）
│   ├── config.ts           # env + flags → Config（純粋）
│   ├── flags.ts            # 手書き CLI パーサ（純粋）
│   ├── git.ts              # child_process.execFile による git 実行
│   ├── keywords.ts         # diff → 識別子候補（純粋）
│   ├── llm.ts              # OpenAI 互換 fetch クライアント
│   ├── logger.ts           # picocolors による色付き出力
│   ├── nexus-client.ts     # POST /api/search（fetch）
│   ├── prompt.ts           # system/user プロンプト生成（純粋）
│   ├── truncate.ts         # diff+context の予算配分切り詰め（純粋）
│   └── types.ts            # 共通型（Config, NexusResult, GitClient...）
├── tests/                  # src/*.ts と 1:1 対応
│   ├── config.test.ts
│   ├── flags.test.ts
│   ├── git.test.ts
│   ├── keywords.test.ts
│   ├── llm.test.ts
│   ├── nexus-client.test.ts
│   ├── prompt.test.ts
│   └── truncate.test.ts
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .prettierrc.json
├── eslint.config.js
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

各ファイルの責務は設計書 §3.2 に準拠。

---

## Phase 0: CI/CD Setup

**Phase Branch:** `feature/phase-0__ci-cd__base`（`master` から派生、PR ベース = `master`）

**Goal:** master ブランチ保護のため GitHub Actions CI を先行構築する。後続 Phase のテスト追加で CI がそのまま活用できる状態にする。

**Milestone:** CI 設定が master にマージされ、以降の PR に対して自動実行される。

### Task 0-1: GitHub Actions ワークフロー追加

**Branch:** `feature/phase0-task1__github-actions` (from `feature/phase-0__ci-cd__base`)
**PR Target:** `feature/phase-0__ci-cd__base`

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Phase ブランチと Task ブランチの作成**

```bash
git checkout master
git pull origin master
git checkout -b feature/phase-0__ci-cd__base
git push -u origin feature/phase-0__ci-cd__base
git checkout -b feature/phase0-task1__github-actions
```

- [ ] **Step 2: ワークフローファイルを作成**

`.github/workflows/ci.yml` を以下の内容で作成：

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-slim
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        if: hashFiles('package.json') != ''
        run: npm ci

      - name: Typecheck
        if: hashFiles('package.json') != ''
        run: npm run typecheck

      - name: Lint
        if: hashFiles('package.json') != ''
        run: npm run lint

      - name: Test
        if: hashFiles('package.json') != ''
        run: npm test

      - name: Placeholder (pre-scaffold)
        if: hashFiles('package.json') == ''
        run: echo "CI workflow ready. Actual jobs activate when package.json lands in Phase 1."
```

> **設計意図:** Phase 0 の時点ではまだ `package.json` が存在しないため、`hashFiles` 条件で実質的な処理をスキップさせる。Phase 1 以降で `package.json` が導入されたタイミングで、この同じワークフローが自動的に本来のジョブを実行する。Runner は要件どおり `ubuntu-slim` を指定（オーガニゼーション内で別途セルフホスト定義がある前提）。

- [ ] **Step 3: YAML 構文の妥当性確認**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK
```

Expected output: `OK`（エラーなく解析できる）

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow with master branch trigger"
```

- [ ] **Step 5: Push と Draft PR 作成**

```bash
git push -u origin feature/phase0-task1__github-actions

gh pr create --draft \
  --base feature/phase-0__ci-cd__base \
  --head feature/phase0-task1__github-actions \
  --title "ci: GitHub Actions ワークフロー追加" \
  --body "$(cat <<'EOF'
## Summary
- master の push/PR を契機に実行される CI ワークフローを追加
- Runner は ubuntu-slim、Node 22、typecheck/lint/test を段階的に実行
- package.json 未存在時はスキップ（Phase 1 以降で有効化）

## Test plan
- [ ] YAML 構文が妥当であることを確認
- [ ] master へのマージ後、プレースホルダジョブが green になること
EOF
)"
```

- [ ] **Step 6: Phase ブランチ → master の Draft PR を作成**（Phase 0 全体としての PR）

```bash
gh pr create --draft \
  --base master \
  --head feature/phase-0__ci-cd__base \
  --title "ci: Phase 0 — CI/CD 構築" \
  --body "$(cat <<'EOF'
## Summary
- GitHub Actions CI ワークフロー導入
- master の push/PR でテスト・lint・typecheck を実行（package.json 投入後に自動有効化）

## Test plan
- [ ] Task 0-1 の PR が本ブランチにマージされること
- [ ] 本ブランチ向け CI ジョブが green であること
EOF
)"
```

---

## Phase 1: Project Scaffold + DevContainer

**Phase Branch:** `feature/phase-1__project-scaffold__base`（`master` から派生、PR ベース = `master`）

**Goal:** Node 22 + TypeScript + ESM + Vitest + ESLint + Prettier + DevContainer を揃え、`npm ci`・`npm run typecheck`・`npm run lint`・`npm run test`・`npm run build` のすべてが成功する状態を作る。

**Milestone:** CI が有効化され、以後の Phase のテスト追加が即座に CI で検証される。

### Task 1-1: package.json / tsconfig / .gitignore / .nvmrc / .editorconfig

**Branch:** `feature/phase1-task1__base-config` (from `feature/phase-1__project-scaffold__base`)
**PR Target:** `feature/phase-1__project-scaffold__base`

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.nvmrc`, `.editorconfig`

- [ ] **Step 1: Phase ブランチと Task ブランチの作成**

```bash
git checkout master
git pull origin master
git checkout -b feature/phase-1__project-scaffold__base
git push -u origin feature/phase-1__project-scaffold__base
git checkout -b feature/phase1-task1__base-config
```

- [ ] **Step 2: `.gitignore` を作成**

```gitignore
node_modules/
dist/
coverage/
.DS_Store
*.log
.env
.env.*
!.env.example
```

- [ ] **Step 3: `.nvmrc` を作成**

```text
22
```

- [ ] **Step 4: `.editorconfig` を作成**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: `package.json` を作成**

```json
{
  "name": "@yohi/nexus-commit",
  "version": "0.1.0",
  "description": "AI-powered Conventional Commits generator using local LLM and Nexus index",
  "type": "module",
  "engines": { "node": ">=22" },
  "bin": { "nxc": "./dist/bin/nxc.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc && node -e \"import('node:fs').then(f=>f.chmodSync('dist/bin/nxc.js',0o755))\"",
    "dev": "tsx src/bin/nxc.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write src tests",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^9.17.0",
    "prettier": "^3.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 6: `tsconfig.json` を作成**

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 7: 依存インストールとコミット**

```bash
npm install
git add package.json package-lock.json tsconfig.json .gitignore .nvmrc .editorconfig
git commit -m "chore: add base project configuration (package.json, tsconfig, editorconfig)"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase1-task1__base-config

gh pr create --draft \
  --base feature/phase-1__project-scaffold__base \
  --head feature/phase1-task1__base-config \
  --title "chore: 基本プロジェクト設定を追加" \
  --body "$(cat <<'EOF'
## Summary
- package.json / tsconfig.json / .gitignore / .nvmrc / .editorconfig を追加
- Node 22 / ESM / TypeScript strict / noUncheckedIndexedAccess を有効化

## Test plan
- [ ] `npm ci` が成功すること
- [ ] `npm run typecheck` が成功すること（まだ src が空でも OK）
EOF
)"
```

---

### Task 1-2: ESLint + Prettier 設定

**Branch:** `feature/phase1-task2__lint-format` (from `feature/phase1-task1__base-config`)
**PR Target:** `feature/phase-1__project-scaffold__base`

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase1-task1__base-config
git checkout -b feature/phase1-task2__lint-format
```

- [ ] **Step 2: `.prettierrc.json` を作成**

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

- [ ] **Step 3: `.prettierignore` を作成**

```text
dist
node_modules
coverage
package-lock.json
```

- [ ] **Step 4: `eslint.config.js` を作成**

```javascript
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
```

- [ ] **Step 5: `npm run lint` が 0 ファイルでも成功することを確認**

```bash
npm run lint
```

Expected: エラーなし（警告も 0）。lint 対象ファイルが存在しなくても exit 0 になる。

- [ ] **Step 6: コミット**

```bash
git add eslint.config.js .prettierrc.json .prettierignore
git commit -m "chore: add ESLint flat config and Prettier configuration"
```

- [ ] **Step 7: Push と Draft PR 作成**

```bash
git push -u origin feature/phase1-task2__lint-format

gh pr create --draft \
  --base feature/phase-1__project-scaffold__base \
  --head feature/phase1-task2__lint-format \
  --title "chore: ESLint (flat config) と Prettier 設定を追加" \
  --body "$(cat <<'EOF'
## Summary
- ESLint flat config + @typescript-eslint プラグインを設定
- Prettier 設定（シングルクォート / セミコロン / trailingComma: all）
- no-explicit-any を error に

## Test plan
- [ ] `npm run lint` が exit 0 であること
EOF
)"
```

---

### Task 1-3: Vitest 設定 + スモークテスト

**Branch:** `feature/phase1-task3__vitest-setup` (from `feature/phase1-task2__lint-format`)
**PR Target:** `feature/phase-1__project-scaffold__base`

**Files:**
- Create: `vitest.config.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase1-task2__lint-format
git checkout -b feature/phase1-task3__vitest-setup
```

- [ ] **Step 2: `vitest.config.ts` を作成**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/bin/**', 'src/types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
```

- [ ] **Step 3: 失敗するスモークテストを作成**

`tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('Vitest runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: テストが実行されて PASS することを確認**

```bash
npm test
```

Expected output（抜粋）:
```
✓ tests/smoke.test.ts (1 test)
Test Files  1 passed (1)
     Tests  1 passed (1)
```

- [ ] **Step 5: `npm run typecheck` が通ることを確認**

```bash
npm run typecheck
```

Expected: エラーなし（exit 0）

- [ ] **Step 6: コミット**

```bash
git add vitest.config.ts tests/smoke.test.ts
git commit -m "test: add Vitest configuration with smoke test"
```

- [ ] **Step 7: Push と Draft PR 作成**

```bash
git push -u origin feature/phase1-task3__vitest-setup

gh pr create --draft \
  --base feature/phase-1__project-scaffold__base \
  --head feature/phase1-task3__vitest-setup \
  --title "test: Vitest 設定とスモークテストを追加" \
  --body "$(cat <<'EOF'
## Summary
- vitest.config.ts で tests/**/*.test.ts をルーティング
- カバレッジ設定（src/bin, types.ts 除外）
- 1+1=2 のスモークテスト

## Test plan
- [ ] `npm test` が 1 passed で成功すること
- [ ] `npm run typecheck` が成功すること
EOF
)"
```

---

### Task 1-4: DevContainer 設定

**Branch:** `feature/phase1-task4__devcontainer` (from `feature/phase1-task3__vitest-setup`)
**PR Target:** `feature/phase-1__project-scaffold__base`

**Files:**
- Create: `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase1-task3__vitest-setup
git checkout -b feature/phase1-task4__devcontainer
```

- [ ] **Step 2: `.devcontainer/Dockerfile` を作成**

```dockerfile
FROM node:22-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

USER node
```

- [ ] **Step 3: `.devcontainer/devcontainer.json` を作成**

```json
{
  "name": "nexus-commit",
  "build": { "dockerfile": "Dockerfile" },
  "postCreateCommand": "npm ci",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "vitest.explorer"
      ]
    }
  },
  "remoteUser": "node",
  "runArgs": ["--network=host"]
}
```

> **注意:** `--network=host` は Linux ホストを想定。macOS / Windows の場合は `NEXUS_API_URL` / `NEXUS_COMMIT_LLM_URL` に `http://host.docker.internal:<port>` を設定する（設計書 §10.1 参照）。

- [ ] **Step 4: JSON 構文の妥当性確認**

```bash
python3 -c "import json; json.load(open('.devcontainer/devcontainer.json'))" && echo OK
```

Expected: `OK`

- [ ] **Step 5: コミット**

```bash
git add .devcontainer/
git commit -m "chore: add DevContainer (node:22-bookworm, --network=host for Linux)"
```

- [ ] **Step 6: Push と Draft PR 作成**

```bash
git push -u origin feature/phase1-task4__devcontainer

gh pr create --draft \
  --base feature/phase-1__project-scaffold__base \
  --head feature/phase1-task4__devcontainer \
  --title "chore: DevContainer 設定を追加" \
  --body "$(cat <<'EOF'
## Summary
- node:22-bookworm + git/curl/ca-certificates の Dockerfile
- postCreateCommand で npm ci
- --network=host でホスト Nexus/Ollama へアクセス（Linux）
- 非 Linux は host.docker.internal 推奨（README で案内予定）

## Test plan
- [ ] JSON 構文が妥当であること
- [ ] Dockerfile が docker build に通ること（ローカル手動検証）
EOF
)"
```

- [ ] **Step 7: Phase 1 全体の Draft PR を作成（master 向け）**

```bash
gh pr create --draft \
  --base master \
  --head feature/phase-1__project-scaffold__base \
  --title "chore: Phase 1 — プロジェクト scaffold と DevContainer" \
  --body "$(cat <<'EOF'
## Summary
- package.json / tsconfig / ESLint / Prettier / Vitest / DevContainer を整備
- npm ci / typecheck / lint / test / build が成功する状態に

## Test plan
- [ ] Phase 1 の全 Task PR がマージされること
- [ ] 本ブランチ向け CI が green
EOF
)"
```

---

## Phase 2: Pure Logic Modules

**Phase Branch:** `feature/phase-2__pure-logic__base`（`master` から派生、PR ベース = `master`）

**Goal:** I/O を持たない純粋関数群（types / logger / flags / config / keywords / truncate / prompt）を TDD で実装する。全モジュールに 1:1 のテストが揃い、95%+ の行カバレッジを達成する。

**Milestone:** 純粋ロジックの骨格が完成し、後続 I/O レイヤーでの組み立てが可能な状態。

### Task 2-1: 共通型定義と Logger

**Branch:** `feature/phase2-task1__types-logger` (from `feature/phase-2__pure-logic__base`)
**PR Target:** `feature/phase-2__pure-logic__base`

**Files:**
- Create: `src/types.ts`, `src/logger.ts`

- [ ] **Step 1: Phase ブランチと Task ブランチの作成**

```bash
git checkout master
git pull origin master
git checkout -b feature/phase-2__pure-logic__base
git push -u origin feature/phase-2__pure-logic__base
git checkout -b feature/phase2-task1__types-logger
```

- [ ] **Step 2: `src/types.ts` を作成**

```typescript
export type DiffMode = 'staged' | 'unstaged' | 'all';
export type Lang = 'ja' | 'en';

export interface Config {
  nexusUrl: string;
  llmUrl: string;
  llmModel: string;
  llmApiKey: string;
  lang: Lang;
  maxChars: number;
  nexusTimeoutMs: number;
  llmTimeoutMs: number;
  diffMode: DiffMode;
  dryRun: boolean;
  useContext: boolean;
}

export interface DiffResult {
  diff: string;
  files: string[];
}

export interface NexusSearchRequest {
  query: string;
  files: string[];
}

export interface NexusResult {
  file: string;
  content: string;
}

export interface ChatRequest {
  system: string;
  user: string;
  model: string;
}

export interface GitClient {
  isRepo(): Promise<boolean>;
  getDiff(mode: DiffMode): Promise<DiffResult>;
  commit(message: string): Promise<void>;
}

export interface NexusClientPort {
  search(
    req: NexusSearchRequest,
    opts: { timeoutMs: number },
  ): Promise<NexusResult[]>;
}

export interface LlmClientPort {
  chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string>;
}
```

- [ ] **Step 3: `src/logger.ts` を作成**

```typescript
import pc from 'picocolors';

export const logger = {
  info(msg: string): void {
    console.log(`${pc.blue('ℹ')} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${pc.yellow('⚠')} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${pc.red('✖')} ${msg}`);
  },
  dim(msg: string): void {
    console.log(pc.dim(msg));
  },
};
```

- [ ] **Step 4: スモークテストを書く**

`tests/logger.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { logger } from '../src/logger.js';

describe('logger', () => {
  it('info writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toContain('hello');
    spy.mockRestore();
  });

  it('warn writes to stderr', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warning');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('error writes to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('oops');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
```

- [ ] **Step 5: テスト + typecheck + lint を実行**

```bash
npm test -- tests/logger.test.ts
npm run typecheck
npm run lint
```

Expected: 全て PASS

- [ ] **Step 6: スモークテストを削除（types/logger 導入完了）**

```bash
git rm tests/smoke.test.ts
```

- [ ] **Step 7: コミット**

```bash
git add src/types.ts src/logger.ts tests/logger.test.ts
git commit -m "feat: add shared types and logger module"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase2-task1__types-logger

gh pr create --draft \
  --base feature/phase-2__pure-logic__base \
  --head feature/phase2-task1__types-logger \
  --title "feat: 共通型定義と logger モジュールを追加" \
  --body "$(cat <<'EOF'
## Summary
- Config / DiffResult / NexusResult 等の共通型を src/types.ts に定義
- picocolors ベースの logger を追加
- DI 用インターフェース（GitClient / NexusClientPort / LlmClientPort）も同時定義

## Test plan
- [ ] logger のスモークテストが PASS
- [ ] typecheck / lint が通ること
EOF
)"
```

---

### Task 2-2: flags.ts（CLI フラグ解析）

**Branch:** `feature/phase2-task2__flags` (from `feature/phase2-task1__types-logger`)
**PR Target:** `feature/phase-2__pure-logic__base`

**Files:**
- Create: `src/flags.ts`, `tests/flags.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase2-task1__types-logger
git checkout -b feature/phase2-task2__flags
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/flags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFlags } from '../src/flags.js';

describe('parseFlags', () => {
  it('returns defaults when argv is empty', () => {
    const flags = parseFlags([]);
    expect(flags).toMatchObject({
      diffMode: 'staged',
      dryRun: false,
      useContext: true,
      help: false,
      version: false,
    });
    expect(flags.lang).toBeUndefined();
    expect(flags.model).toBeUndefined();
  });

  it('sets diffMode to unstaged', () => {
    expect(parseFlags(['--unstaged']).diffMode).toBe('unstaged');
  });

  it('sets diffMode to all', () => {
    expect(parseFlags(['--all']).diffMode).toBe('all');
  });

  it('--staged explicitly preserves staged default', () => {
    expect(parseFlags(['--staged']).diffMode).toBe('staged');
  });

  it('--dry-run toggles dryRun', () => {
    expect(parseFlags(['--dry-run']).dryRun).toBe(true);
  });

  it('--no-context disables useContext', () => {
    expect(parseFlags(['--no-context']).useContext).toBe(false);
  });

  it('--lang ja is accepted', () => {
    expect(parseFlags(['--lang', 'ja']).lang).toBe('ja');
  });

  it('--lang en is accepted', () => {
    expect(parseFlags(['--lang', 'en']).lang).toBe('en');
  });

  it('throws on invalid --lang value', () => {
    expect(() => parseFlags(['--lang', 'fr'])).toThrow(/Invalid lang/);
  });

  it('throws when --lang has no value', () => {
    expect(() => parseFlags(['--lang'])).toThrow(/requires a value/);
  });

  it('--model captures next token', () => {
    expect(parseFlags(['--model', 'llama3:8b']).model).toBe('llama3:8b');
  });

  it('-h and --help set help flag', () => {
    expect(parseFlags(['-h']).help).toBe(true);
    expect(parseFlags(['--help']).help).toBe(true);
  });

  it('-v and --version set version flag', () => {
    expect(parseFlags(['-v']).version).toBe(true);
    expect(parseFlags(['--version']).version).toBe(true);
  });

  it('throws on unknown flag', () => {
    expect(() => parseFlags(['--unknown'])).toThrow(/Unknown flag/);
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/flags.test.ts
```

Expected: `Cannot find module '../src/flags.js'`（モジュール未作成エラー）

- [ ] **Step 4: `src/flags.ts` を実装**

```typescript
import type { DiffMode, Lang } from './types.js';

export interface Flags {
  diffMode: DiffMode;
  lang?: Lang;
  model?: string;
  dryRun: boolean;
  useContext: boolean;
  help: boolean;
  version: boolean;
}

function requireNext(argv: string[], i: number, flag: string): string {
  const value = argv[i + 1];
  if (value === undefined) {
    throw new Error(`Flag ${flag} requires a value`);
  }
  return value;
}

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    diffMode: 'staged',
    dryRun: false,
    useContext: true,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--staged':
        flags.diffMode = 'staged';
        break;
      case '--unstaged':
        flags.diffMode = 'unstaged';
        break;
      case '--all':
        flags.diffMode = 'all';
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--no-context':
        flags.useContext = false;
        break;
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '-v':
      case '--version':
        flags.version = true;
        break;
      case '--lang': {
        const value = requireNext(argv, i, '--lang');
        if (value !== 'ja' && value !== 'en') {
          throw new Error(`Invalid lang: ${value} (allowed: ja, en)`);
        }
        flags.lang = value;
        i++;
        break;
      }
      case '--model': {
        flags.model = requireNext(argv, i, '--model');
        i++;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return flags;
}
```

- [ ] **Step 5: テストが PASS することを確認**

```bash
npm test -- tests/flags.test.ts
```

Expected: 全テスト PASS

- [ ] **Step 6: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: 双方 exit 0

- [ ] **Step 7: コミット**

```bash
git add src/flags.ts tests/flags.test.ts
git commit -m "feat: add flag parser with validation for --lang and unknown flags"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase2-task2__flags

gh pr create --draft \
  --base feature/phase-2__pure-logic__base \
  --head feature/phase2-task2__flags \
  --title "feat: CLI フラグパーサを追加" \
  --body "$(cat <<'EOF'
## Summary
- --staged / --unstaged / --all / --dry-run / --no-context / --lang / --model / -h / -v を解釈
- 未知フラグと --lang の不正値で throw

## Test plan
- [ ] flags.test.ts 14 件全て PASS
- [ ] typecheck / lint が通ること
EOF
)"
```

---

### Task 2-3: config.ts（env + flags → Config）

**Branch:** `feature/phase2-task3__config` (from `feature/phase2-task2__flags`)
**PR Target:** `feature/phase-2__pure-logic__base`

**Files:**
- Create: `src/config.ts`, `tests/config.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase2-task2__flags
git checkout -b feature/phase2-task3__config
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { Flags } from '../src/flags.js';

const baseFlags: Flags = {
  diffMode: 'staged',
  dryRun: false,
  useContext: true,
  help: false,
  version: false,
};

describe('loadConfig', () => {
  it('applies defaults when env is empty', () => {
    const cfg = loadConfig({}, baseFlags);
    expect(cfg.nexusUrl).toBe('http://localhost:8080');
    expect(cfg.llmUrl).toBe('http://localhost:11434/v1');
    expect(cfg.llmModel).toBe('qwen2.5-coder:7b');
    expect(cfg.llmApiKey).toBe('ollama');
    expect(cfg.lang).toBe('ja');
    expect(cfg.maxChars).toBe(24000);
    expect(cfg.nexusTimeoutMs).toBe(5000);
    expect(cfg.llmTimeoutMs).toBe(60000);
    expect(cfg.diffMode).toBe('staged');
    expect(cfg.dryRun).toBe(false);
    expect(cfg.useContext).toBe(true);
  });

  it('env overrides defaults', () => {
    const cfg = loadConfig(
      {
        NEXUS_API_URL: 'http://nexus.example:9090',
        NEXUS_COMMIT_LLM_URL: 'http://llm.example/v1',
        NEXUS_COMMIT_LLM_MODEL: 'llama3:8b',
        NEXUS_COMMIT_LLM_API_KEY: 'secret',
        NEXUS_COMMIT_LANG: 'en',
        NEXUS_COMMIT_MAX_CHARS: '32000',
        NEXUS_COMMIT_NEXUS_TIMEOUT_MS: '3000',
        NEXUS_COMMIT_LLM_TIMEOUT_MS: '90000',
      },
      baseFlags,
    );
    expect(cfg.nexusUrl).toBe('http://nexus.example:9090');
    expect(cfg.llmUrl).toBe('http://llm.example/v1');
    expect(cfg.llmModel).toBe('llama3:8b');
    expect(cfg.llmApiKey).toBe('secret');
    expect(cfg.lang).toBe('en');
    expect(cfg.maxChars).toBe(32000);
    expect(cfg.nexusTimeoutMs).toBe(3000);
    expect(cfg.llmTimeoutMs).toBe(90000);
  });

  it('flags override env', () => {
    const cfg = loadConfig(
      { NEXUS_COMMIT_LANG: 'en', NEXUS_COMMIT_LLM_MODEL: 'envModel' },
      { ...baseFlags, lang: 'ja', model: 'flagModel' },
    );
    expect(cfg.lang).toBe('ja');
    expect(cfg.llmModel).toBe('flagModel');
  });

  it('throws on invalid lang env', () => {
    expect(() => loadConfig({ NEXUS_COMMIT_LANG: 'fr' }, baseFlags)).toThrow(
      /Invalid lang/,
    );
  });

  it('throws on non-numeric maxChars', () => {
    expect(() =>
      loadConfig({ NEXUS_COMMIT_MAX_CHARS: 'abc' }, baseFlags),
    ).toThrow(/Invalid maxChars/);
  });

  it('throws on zero maxChars', () => {
    expect(() =>
      loadConfig({ NEXUS_COMMIT_MAX_CHARS: '0' }, baseFlags),
    ).toThrow(/Invalid maxChars/);
  });

  it('throws on negative timeout', () => {
    expect(() =>
      loadConfig({ NEXUS_COMMIT_LLM_TIMEOUT_MS: '-1' }, baseFlags),
    ).toThrow(/Invalid timeout/);
  });

  it('--no-context propagates to useContext:false', () => {
    const cfg = loadConfig({}, { ...baseFlags, useContext: false });
    expect(cfg.useContext).toBe(false);
  });

  it('diffMode flag propagates', () => {
    const cfg = loadConfig({}, { ...baseFlags, diffMode: 'all' });
    expect(cfg.diffMode).toBe('all');
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/config.test.ts
```

Expected: `Cannot find module '../src/config.js'`

- [ ] **Step 4: `src/config.ts` を実装**

```typescript
import type { Config, Lang } from './types.js';
import type { Flags } from './flags.js';

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) {
    if (name === 'maxChars') throw new Error(`Invalid maxChars: ${raw}`);
    throw new Error(`Invalid timeout for ${name}: ${raw}`);
  }
  return n;
}

function parseLang(raw: string | undefined, fallback: Lang): Lang {
  if (raw === undefined) return fallback;
  if (raw !== 'ja' && raw !== 'en') {
    throw new Error(`Invalid lang: ${raw} (allowed: ja, en)`);
  }
  return raw;
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  flags: Flags,
): Config {
  const lang = flags.lang ?? parseLang(env['NEXUS_COMMIT_LANG'], 'ja');
  const maxChars = parsePositiveInt(env['NEXUS_COMMIT_MAX_CHARS'], 24000, 'maxChars');
  const nexusTimeoutMs = parsePositiveInt(
    env['NEXUS_COMMIT_NEXUS_TIMEOUT_MS'],
    5000,
    'nexusTimeoutMs',
  );
  const llmTimeoutMs = parsePositiveInt(
    env['NEXUS_COMMIT_LLM_TIMEOUT_MS'],
    60000,
    'llmTimeoutMs',
  );

  return {
    nexusUrl: env['NEXUS_API_URL'] ?? 'http://localhost:8080',
    llmUrl: env['NEXUS_COMMIT_LLM_URL'] ?? 'http://localhost:11434/v1',
    llmModel: flags.model ?? env['NEXUS_COMMIT_LLM_MODEL'] ?? 'qwen2.5-coder:7b',
    llmApiKey: env['NEXUS_COMMIT_LLM_API_KEY'] ?? 'ollama',
    lang,
    maxChars,
    nexusTimeoutMs,
    llmTimeoutMs,
    diffMode: flags.diffMode,
    dryRun: flags.dryRun,
    useContext: flags.useContext,
  };
}
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/config.test.ts
```

Expected: 9 件全て PASS

- [ ] **Step 6: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: コミット**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add loadConfig with env/flags precedence and validation"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase2-task3__config

gh pr create --draft \
  --base feature/phase-2__pure-logic__base \
  --head feature/phase2-task3__config \
  --title "feat: loadConfig を追加（env + flags → Config）" \
  --body "$(cat <<'EOF'
## Summary
- env + flags → Config を純粋関数で組み立て
- 優先順位: flags > env > default
- 不正 lang / maxChars / timeout は throw

## Test plan
- [ ] config.test.ts 9 件全て PASS
EOF
)"
```

---

### Task 2-4: keywords.ts（識別子抽出）

**Branch:** `feature/phase2-task4__keywords` (from `feature/phase2-task3__config`)
**PR Target:** `feature/phase-2__pure-logic__base`

**Files:**
- Create: `src/keywords.ts`, `tests/keywords.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase2-task3__config
git checkout -b feature/phase2-task4__keywords
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/keywords.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extract } from '../src/keywords.js';

const sampleDiff = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index 111..222 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,3 +1,5 @@',
  '-const oldFunction = () => {};',
  '+const newHandler = () => {};',
  '+const myService = new MyService();',
  '+myService.initialize();',
  '+myService.initialize();',
].join('\n');

describe('extract', () => {
  it('picks identifiers from added lines only', () => {
    const kw = extract(sampleDiff);
    expect(kw).toContain('newHandler');
    expect(kw).toContain('myService');
    expect(kw).toContain('MyService');
    expect(kw).toContain('initialize');
  });

  it('ignores identifiers from removed lines', () => {
    const kw = extract(sampleDiff);
    expect(kw).not.toContain('oldFunction');
  });

  it('ignores the +++ header line', () => {
    const diff = '+++ b/src/SecretHeader.ts\n+const realToken = 1;';
    const kw = extract(diff);
    expect(kw).not.toContain('SecretHeader');
    expect(kw).toContain('realToken');
  });

  it('sorts by frequency descending (initialize twice before newHandler once)', () => {
    const kw = extract(sampleDiff);
    expect(kw.indexOf('initialize')).toBeLessThan(kw.indexOf('newHandler'));
  });

  it('excludes TypeScript reserved keywords', () => {
    const diff = [
      '+const x = 1;',
      '+function fn() { return x; }',
      '+class Foo {}',
      '+import { bar } from "./bar";',
    ].join('\n');
    const kw = extract(diff);
    expect(kw).not.toContain('const');
    expect(kw).not.toContain('function');
    expect(kw).not.toContain('class');
    expect(kw).not.toContain('import');
    expect(kw).not.toContain('from');
    expect(kw).not.toContain('return');
    expect(kw).toContain('fn');
    expect(kw).toContain('Foo');
    expect(kw).toContain('bar');
  });

  it('respects the limit argument', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `+const token${i} = ${i};`);
    const diff = lines.join('\n');
    expect(extract(diff, 10).length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for empty diff', () => {
    expect(extract('')).toEqual([]);
  });

  it('ignores identifiers shorter than 3 chars', () => {
    const diff = '+const a = 1; const ab = 2; const abc = 3;';
    const kw = extract(diff);
    expect(kw).not.toContain('a');
    expect(kw).not.toContain('ab');
    expect(kw).toContain('abc');
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/keywords.test.ts
```

Expected: モジュール未存在エラー

- [ ] **Step 4: `src/keywords.ts` を実装**

```typescript
const TS_RESERVED = new Set([
  'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
  'import', 'export', 'from', 'default', 'return', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this',
  'super', 'extends', 'implements', 'async', 'await', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'void', 'null', 'undefined',
  'true', 'false', 'static', 'public', 'private', 'protected', 'readonly',
  'abstract', 'declare', 'namespace', 'module', 'require', 'yield', 'with',
  'in', 'of', 'as', 'is', 'keyof', 'infer', 'satisfies', 'never',
  'boolean', 'number', 'string', 'symbol', 'bigint', 'unknown', 'any',
  'object', 'then', 'Promise', 'Array', 'Map', 'Set',
]);

const IDENTIFIER_RE = /\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g;

export function extract(diff: string, limit = 20): string[] {
  if (!diff) return [];
  const freq = new Map<string, number>();

  for (const line of diff.split('\n')) {
    if (!line.startsWith('+')) continue;
    if (line.startsWith('+++')) continue;
    const body = line.slice(1);
    for (const match of body.matchAll(IDENTIFIER_RE)) {
      const token = match[0];
      if (TS_RESERVED.has(token)) continue;
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/keywords.test.ts
```

Expected: 8 件全て PASS

- [ ] **Step 6: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: コミット**

```bash
git add src/keywords.ts tests/keywords.test.ts
git commit -m "feat: add keyword extractor with frequency ranking and reserved word filter"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase2-task4__keywords

gh pr create --draft \
  --base feature/phase-2__pure-logic__base \
  --head feature/phase2-task4__keywords \
  --title "feat: diff → 識別子候補抽出を追加" \
  --body "$(cat <<'EOF'
## Summary
- 追加行からのみ識別子を抽出し頻度順にソート
- TS 予約語 / diff ヘッダ / 3 文字未満を除外
- limit で上限カット

## Test plan
- [ ] keywords.test.ts 8 件 PASS
EOF
)"
```

---

### Task 2-5: truncate.ts（予算配分切り詰め）

**Branch:** `feature/phase2-task5__truncate` (from `feature/phase2-task4__keywords`)
**PR Target:** `feature/phase-2__pure-logic__base`

**Files:**
- Create: `src/truncate.ts`, `tests/truncate.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase2-task4__keywords
git checkout -b feature/phase2-task5__truncate
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/truncate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { build } from '../src/truncate.js';
import type { NexusResult } from '../src/types.js';

const mkDiff = (blocks: string[]): string =>
  blocks.map((b) => `diff --git a/${b.slice(0, 4)}.ts b/${b.slice(0, 4)}.ts\n${b}`).join('\n');

describe('truncate.build', () => {
  it('returns input unchanged when within budget', () => {
    const diff = mkDiff(['small content here']);
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'ctx' }];
    const out = build({ diff, contexts, maxChars: 10000 });
    expect(out.diff).toBe(diff);
    expect(out.contexts).toEqual(contexts);
  });

  it('caps diff to 60% of maxChars', () => {
    const diff = mkDiff(['x'.repeat(1000)]);
    const out = build({ diff, contexts: [], maxChars: 100 });
    expect(out.diff.length).toBeLessThanOrEqual(60);
  });

  it('drops trailing blocks first, keeping earliest diff --git header', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      'content-A'.repeat(20),
      'diff --git a/b.ts b/b.ts',
      'content-B'.repeat(20),
    ].join('\n');
    const out = build({ diff, contexts: [], maxChars: 300 });
    expect(out.diff).toContain('diff --git a/a.ts b/a.ts');
    expect(out.diff).not.toContain('diff --git a/b.ts b/b.ts');
  });

  it('removes longest context first on overflow', () => {
    const contexts: NexusResult[] = [
      { file: 'short.ts', content: 'tiny' },
      { file: 'huge.ts', content: 'x'.repeat(500) },
    ];
    const out = build({ diff: '', contexts, maxChars: 200 });
    expect(out.contexts.some((c) => c.file === 'huge.ts')).toBe(false);
    expect(out.contexts.some((c) => c.file === 'short.ts')).toBe(true);
  });

  it('returns empty context array when all exceed budget', () => {
    const contexts: NexusResult[] = [
      { file: 'a.ts', content: 'x'.repeat(500) },
      { file: 'b.ts', content: 'y'.repeat(500) },
    ];
    const out = build({ diff: '', contexts, maxChars: 100 });
    expect(out.contexts).toEqual([]);
  });

  it('handles empty contexts', () => {
    const out = build({ diff: 'diff content', contexts: [], maxChars: 1000 });
    expect(out.contexts).toEqual([]);
  });

  it('handles empty diff', () => {
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'ctx' }];
    const out = build({ diff: '', contexts, maxChars: 100 });
    expect(out.diff).toBe('');
    expect(out.contexts).toEqual(contexts);
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/truncate.test.ts
```

- [ ] **Step 4: `src/truncate.ts` を実装**

```typescript
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
  if (diff.length <= budget) return diff;
  if (budget <= 0) return '';

  const lines = diff.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current.length > 0) blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));

  // Drop trailing blocks until we fit
  while (blocks.length > 1 && blocks.join('\n').length > budget) {
    blocks.pop();
  }
  let result = blocks.join('\n');
  if (result.length > budget) {
    result = result.slice(0, budget);
  }
  return result;
}

function truncateContexts(
  contexts: NexusResult[],
  budget: number,
): NexusResult[] {
  if (contexts.length === 0) return [];
  const total = contexts.reduce((sum, c) => sum + c.content.length, 0);
  if (total <= budget) return contexts;

  // Remove longest content first until within budget
  const remaining = [...contexts];
  while (remaining.reduce((s, c) => s + c.content.length, 0) > budget) {
    let longestIdx = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (remaining[i]!.content.length > remaining[longestIdx]!.content.length) {
        longestIdx = i;
      }
    }
    remaining.splice(longestIdx, 1);
    if (remaining.length === 0) break;
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
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/truncate.test.ts
```

Expected: 7 件全て PASS

- [ ] **Step 6: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: コミット**

```bash
git add src/truncate.ts tests/truncate.test.ts
git commit -m "feat: add truncate with diff/context budget allocation (60/40)"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase2-task5__truncate

gh pr create --draft \
  --base feature/phase-2__pure-logic__base \
  --head feature/phase2-task5__truncate \
  --title "feat: diff+context の文字数予算配分を追加" \
  --body "$(cat <<'EOF'
## Summary
- diff : contexts = 60 : 40 で予算分割
- diff は末尾ブロックから削除しヘッダを残す
- contexts は長い順に完全削除

## Test plan
- [ ] truncate.test.ts 7 件 PASS
EOF
)"
```

---

### Task 2-6: prompt.ts（system/user プロンプト生成）

**Branch:** `feature/phase2-task6__prompt` (from `feature/phase2-task5__truncate`)
**PR Target:** `feature/phase-2__pure-logic__base`

**Files:**
- Create: `src/prompt.ts`, `tests/prompt.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase2-task5__truncate
git checkout -b feature/phase2-task6__prompt
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { build } from '../src/prompt.js';
import type { NexusResult } from '../src/types.js';

describe('prompt.build', () => {
  it('emits Japanese instruction when lang=ja', () => {
    const { system } = build({
      diff: '+x',
      contexts: [],
      files: ['a.ts'],
      lang: 'ja',
    });
    expect(system).toContain('日本語');
  });

  it('emits English instruction when lang=en', () => {
    const { system } = build({
      diff: '+x',
      contexts: [],
      files: ['a.ts'],
      lang: 'en',
    });
    expect(system).toContain('English');
  });

  it('system prompt lists all Conventional Commits types', () => {
    const { system } = build({ diff: '+x', contexts: [], files: [], lang: 'ja' });
    for (const t of ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']) {
      expect(system).toContain(t);
    }
    expect(system).toContain('BREAKING CHANGE');
  });

  it('user prompt includes file list', () => {
    const { user } = build({
      diff: '+x',
      contexts: [],
      files: ['src/a.ts', 'src/b.ts'],
      lang: 'ja',
    });
    expect(user).toContain('src/a.ts');
    expect(user).toContain('src/b.ts');
  });

  it('omits context section when contexts is empty', () => {
    const { user } = build({ diff: '+x', contexts: [], files: [], lang: 'ja' });
    expect(user).not.toContain('関連コンテキスト');
  });

  it('includes context section when contexts are present', () => {
    const contexts: NexusResult[] = [{ file: 'ctx.ts', content: 'some ctx body' }];
    const { user } = build({ diff: '+x', contexts, files: [], lang: 'ja' });
    expect(user).toContain('関連コンテキスト');
    expect(user).toContain('ctx.ts');
    expect(user).toContain('some ctx body');
  });

  it('appends hint when provided', () => {
    const { user } = build({
      diff: '+x',
      contexts: [],
      files: [],
      lang: 'ja',
      hint: 'もっと簡潔に',
    });
    expect(user).toContain('追加の指示');
    expect(user).toContain('もっと簡潔に');
  });

  it('omits hint section when hint is undefined', () => {
    const { user } = build({ diff: '+x', contexts: [], files: [], lang: 'ja' });
    expect(user).not.toContain('追加の指示');
  });

  it('strips ANSI escape sequences from diff', () => {
    const diff = '\x1b[32m+green\x1b[0m\n-\x1b[31mred\x1b[0m';
    const { user } = build({ diff, contexts: [], files: [], lang: 'ja' });
    expect(user).not.toMatch(/\x1b\[/);
    expect(user).toContain('+green');
  });

  it('normalizes CRLF to LF in context content', () => {
    const contexts: NexusResult[] = [{ file: 'a.ts', content: 'line1\r\nline2\r\n' }];
    const { user } = build({ diff: '+x', contexts, files: [], lang: 'ja' });
    expect(user).not.toContain('\r');
    expect(user).toContain('line1\nline2');
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/prompt.test.ts
```

- [ ] **Step 4: `src/prompt.ts` を実装**

```typescript
import type { Lang, NexusResult } from './types.js';

export interface PromptInput {
  diff: string;
  contexts: NexusResult[];
  files: string[];
  lang: Lang;
  hint?: string;
}

export interface PromptOutput {
  system: string;
  user: string;
}

const CC_TYPES = 'feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function buildSystem(lang: Lang): string {
  const langClause = lang === 'ja' ? '日本語で' : 'in English';
  return [
    `あなたは熟練ソフトウェアエンジニアです。`,
    `以下の git diff と関連コンテキストを読み、Conventional Commits v1.0.0 に厳格に準拠した`,
    `コミットメッセージを1件だけ、${langClause}生成してください。`,
    ``,
    `ルール:`,
    `- type は ${CC_TYPES} のいずれか`,
    `- scope は変更対象の主要なモジュール名・パッケージ名。不要なら省略`,
    `- description は命令形で簡潔に`,
    `- 本文が必要なら空行を1行挟んで記述`,
    `- 破壊的変更は BREAKING CHANGE: フッターを付与`,
    `- メッセージ以外のテキスト・コードブロック記号・説明は絶対に出力しない`,
  ].join('\n');
}

function normalizeContent(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function buildUser(input: PromptInput): string {
  const parts: string[] = [];

  parts.push('# 変更ファイル');
  if (input.files.length === 0) {
    parts.push('(なし)');
  } else {
    parts.push(input.files.map((f) => `- ${f}`).join('\n'));
  }

  if (input.contexts.length > 0) {
    parts.push('');
    parts.push('# 関連コンテキスト');
    for (const ctx of input.contexts) {
      parts.push('---');
      parts.push(`file: ${ctx.file}`);
      parts.push('content:');
      parts.push(normalizeContent(ctx.content));
      parts.push('---');
    }
  }

  const cleanedDiff = input.diff.replace(ANSI_RE, '');
  parts.push('');
  parts.push('# Diff');
  parts.push('```diff');
  parts.push(cleanedDiff);
  parts.push('```');

  if (input.hint) {
    parts.push('');
    parts.push('# 追加の指示');
    parts.push(input.hint);
  }

  return parts.join('\n');
}

export function build(input: PromptInput): PromptOutput {
  return {
    system: buildSystem(input.lang),
    user: buildUser(input),
  };
}
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/prompt.test.ts
```

Expected: 10 件全て PASS

- [ ] **Step 6: 全テスト実行で回帰なしを確認**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
git add src/prompt.ts tests/prompt.test.ts
git commit -m "feat: add system/user prompt builder with ANSI stripping and CRLF normalization"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase2-task6__prompt

gh pr create --draft \
  --base feature/phase-2__pure-logic__base \
  --head feature/phase2-task6__prompt \
  --title "feat: プロンプトビルダーを追加" \
  --body "$(cat <<'EOF'
## Summary
- system: Conventional Commits v1.0.0 の厳格指示 + 言語切替
- user: 変更ファイル / 関連コンテキスト / Diff / 追加指示の条件付き結合
- ANSI エスケープ除去と CRLF → LF 正規化

## Test plan
- [ ] prompt.test.ts 10 件 PASS
- [ ] 全体 `npm test` が green
EOF
)"
```

- [ ] **Step 9: Phase 2 全体の Draft PR を作成（master 向け）**

```bash
gh pr create --draft \
  --base master \
  --head feature/phase-2__pure-logic__base \
  --title "feat: Phase 2 — 純粋ロジック層の実装" \
  --body "$(cat <<'EOF'
## Summary
- types / logger / flags / config / keywords / truncate / prompt を実装
- I/O を一切持たない純粋関数群、ユニットテスト完備

## Test plan
- [ ] 全 Task PR がマージされていること
- [ ] 本ブランチ向け CI が green
EOF
)"
```

---

## Phase 3: I/O Clients

**Phase Branch:** `feature/phase-3__io-clients__base`（`master` から派生、PR ベース = `master`）

**Goal:** git / Nexus / LLM の外部 I/O を扱う具象クライアントを実装する。全て DI インターフェース (`GitClient` / `NexusClientPort` / `LlmClientPort`) に準拠し、テストでは `vi.mock` / `vi.stubGlobal('fetch')` で副作用を遮断する。

**Milestone:** 全 I/O クライアントが単独テストで検証済み。Phase 4 での組み立てが可能。

### Task 3-1: git.ts（child_process.execFile ベース）

**Branch:** `feature/phase3-task1__git-client` (from `feature/phase-3__io-clients__base`)
**PR Target:** `feature/phase-3__io-clients__base`

**Files:**
- Create: `src/git.ts`, `tests/git.test.ts`

- [ ] **Step 1: Phase ブランチと Task ブランチの作成**

```bash
git checkout master
git pull origin master
git checkout -b feature/phase-3__io-clients__base
git push -u origin feature/phase-3__io-clients__base
git checkout -b feature/phase3-task1__git-client
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/git.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { NodeGitClient } from '../src/git.js';

const mockExecFile = vi.mocked(execFile);

type CB = (error: Error | null, stdout: string, stderr: string) => void;

function stubSuccess(stdout: string): void {
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
    cb(null, stdout, '');
    return {} as never;
  }) as never);
}

function stubFailure(err: Error): void {
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
    cb(err, '', '');
    return {} as never;
  }) as never);
}

beforeEach(() => {
  mockExecFile.mockReset();
});

describe('NodeGitClient', () => {
  it('isRepo returns true when rev-parse succeeds', async () => {
    stubSuccess('true\n');
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      expect.any(Function),
    );
  });

  it('isRepo returns false when rev-parse fails', async () => {
    stubFailure(new Error('not a repo'));
    const client = new NodeGitClient();
    expect(await client.isRepo()).toBe(false);
  });

  it('getDiff staged invokes git diff --staged', async () => {
    const outputs = [
      'diff content staged',
      'src/foo.ts\nsrc/bar.ts\n',
    ];
    let call = 0;
    mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
      cb(null, outputs[call++]!, '');
      return {} as never;
    }) as never);

    const client = new NodeGitClient();
    const result = await client.getDiff('staged');
    expect(result.diff).toBe('diff content staged');
    expect(result.files).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('getDiff unstaged uses no --staged flag', async () => {
    let seenArgs: string[] | undefined;
    mockExecFile.mockImplementation(((_cmd: string, args: string[], cb: CB) => {
      seenArgs = args;
      cb(null, 'diff', '');
      return {} as never;
    }) as never);
    await new NodeGitClient().getDiff('unstaged');
    expect(seenArgs).not.toContain('--staged');
  });

  it('getDiff all merges staged + unstaged', async () => {
    const outputs = ['staged-diff', 'unstaged-diff', 'a.ts\n', 'b.ts\n'];
    let call = 0;
    mockExecFile.mockImplementation(((_cmd: string, _args: string[], cb: CB) => {
      cb(null, outputs[call++]!, '');
      return {} as never;
    }) as never);
    const result = await new NodeGitClient().getDiff('all');
    expect(result.diff).toContain('staged-diff');
    expect(result.diff).toContain('unstaged-diff');
    expect(result.files).toEqual(expect.arrayContaining(['a.ts', 'b.ts']));
  });

  it('commit invokes git commit -m', async () => {
    stubSuccess('');
    await new NodeGitClient().commit('feat: add X');
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'feat: add X'],
      expect.any(Function),
    );
  });

  it('commit surfaces underlying error', async () => {
    stubFailure(new Error('pre-commit hook failed'));
    await expect(new NodeGitClient().commit('m')).rejects.toThrow('pre-commit hook failed');
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/git.test.ts
```

- [ ] **Step 4: `src/git.ts` を実装**

```typescript
import { execFile } from 'node:child_process';
import type { DiffMode, DiffResult, GitClient } from './types.js';

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function diffStaged(): Promise<string> {
  return runGit(['diff', '--staged', '--no-color']);
}

async function diffUnstaged(): Promise<string> {
  return runGit(['diff', '--no-color']);
}

async function filesStaged(): Promise<string[]> {
  const out = await runGit(['diff', '--name-only', '--staged']);
  return out.split('\n').filter(Boolean);
}

async function filesUnstaged(): Promise<string[]> {
  const out = await runGit(['diff', '--name-only']);
  return out.split('\n').filter(Boolean);
}

export class NodeGitClient implements GitClient {
  async isRepo(): Promise<boolean> {
    try {
      await runGit(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  async getDiff(mode: DiffMode): Promise<DiffResult> {
    if (mode === 'staged') {
      const [diff, files] = await Promise.all([diffStaged(), filesStaged()]);
      return { diff, files };
    }
    if (mode === 'unstaged') {
      const [diff, files] = await Promise.all([diffUnstaged(), filesUnstaged()]);
      return { diff, files };
    }
    const [s, u, sf, uf] = await Promise.all([
      diffStaged(),
      diffUnstaged(),
      filesStaged(),
      filesUnstaged(),
    ]);
    return {
      diff: s + u,
      files: [...new Set([...sf, ...uf])],
    };
  }

  async commit(message: string): Promise<void> {
    await runGit(['commit', '-m', message]);
  }
}
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/git.test.ts
```

Expected: 7 件全て PASS

- [ ] **Step 6: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: コミット**

```bash
git add src/git.ts tests/git.test.ts
git commit -m "feat: add NodeGitClient using child_process.execFile"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase3-task1__git-client

gh pr create --draft \
  --base feature/phase-3__io-clients__base \
  --head feature/phase3-task1__git-client \
  --title "feat: git クライアントを追加（execFile ベース）" \
  --body "$(cat <<'EOF'
## Summary
- execFile 直叩き（シェル経由なし）で引数インジェクション防止
- isRepo / getDiff(staged|unstaged|all) / commit
- vi.mock('node:child_process') によるユニットテスト

## Test plan
- [ ] git.test.ts 7 件 PASS
EOF
)"
```

---

### Task 3-2: nexus-client.ts（POST /api/search）

**Branch:** `feature/phase3-task2__nexus-client` (from `feature/phase3-task1__git-client`)
**PR Target:** `feature/phase-3__io-clients__base`

**Files:**
- Create: `src/nexus-client.ts`, `tests/nexus-client.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase3-task1__git-client
git checkout -b feature/phase3-task2__nexus-client
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/nexus-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpNexusClient } from '../src/nexus-client.js';

describe('HttpNexusClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockResponse(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }

  it('returns NexusResult[] on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ results: [{ file: 'a.ts', content: 'ctx' }] }),
    );
    const client = new HttpNexusClient('http://localhost:8080');
    const result = await client.search(
      { query: 'q', files: ['a.ts'] },
      { timeoutMs: 5000 },
    );
    expect(result).toEqual([{ file: 'a.ts', content: 'ctx' }]);
  });

  it('sends POST to /api/search with JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ results: [] }));
    const client = new HttpNexusClient('http://localhost:8080');
    await client.search({ query: 'q', files: [] }, { timeoutMs: 5000 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://localhost:8080/api/search');
    expect(opts!.method).toBe('POST');
    expect((opts!.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(opts!.body as string)).toEqual({ query: 'q', files: [] });
  });

  it('throws on 5xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, false, 500));
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow(/Nexus API error: 500/);
  });

  it('throws on 4xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, false, 404));
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow(/Nexus API error: 404/);
  });

  it('throws on invalid results schema', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ other: true }));
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow();
  });

  it('throws on invalid item shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ results: [{ file: 123, content: 'x' }] }),
    );
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 5000 }),
    ).rejects.toThrow();
  });

  it('aborts on timeout', async () => {
    vi.mocked(fetch).mockImplementation(((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as never);
    const client = new HttpNexusClient('http://localhost:8080');
    await expect(
      client.search({ query: 'q', files: [] }, { timeoutMs: 10 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/nexus-client.test.ts
```

- [ ] **Step 4: `src/nexus-client.ts` を実装**

```typescript
import type {
  NexusClientPort,
  NexusResult,
  NexusSearchRequest,
} from './types.js';

interface RawItem {
  file?: unknown;
  content?: unknown;
}

function parseResults(data: unknown): NexusResult[] {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('results' in data) ||
    !Array.isArray((data as { results: unknown }).results)
  ) {
    throw new Error('Invalid Nexus response: missing or non-array "results"');
  }
  const items = (data as { results: unknown[] }).results;
  return items.map((raw, idx) => {
    const item = raw as RawItem;
    if (typeof item.file !== 'string' || typeof item.content !== 'string') {
      throw new Error(`Invalid Nexus result item at index ${idx}`);
    }
    return { file: item.file, content: item.content };
  });
}

export class HttpNexusClient implements NexusClientPort {
  constructor(private readonly baseUrl: string) {}

  async search(
    req: NexusSearchRequest,
    opts: { timeoutMs: number },
  ): Promise<NexusResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`Nexus API error: ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    return parseResults(data);
  }
}
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/nexus-client.test.ts
```

Expected: 7 件全て PASS

- [ ] **Step 6: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: コミット**

```bash
git add src/nexus-client.ts tests/nexus-client.test.ts
git commit -m "feat: add HttpNexusClient with AbortController timeout"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase3-task2__nexus-client

gh pr create --draft \
  --base feature/phase-3__io-clients__base \
  --head feature/phase3-task2__nexus-client \
  --title "feat: Nexus クライアント（POST /api/search）を追加" \
  --body "$(cat <<'EOF'
## Summary
- POST {baseUrl}/api/search の fetch 実装
- AbortController + clearTimeout によるタイムアウト
- 4xx/5xx/形式不正/タイムアウト全てで throw

## Test plan
- [ ] nexus-client.test.ts 7 件 PASS
EOF
)"
```

---

### Task 3-3: llm.ts（OpenAI 互換 chat/completions）

**Branch:** `feature/phase3-task3__llm-client` (from `feature/phase3-task2__nexus-client`)
**PR Target:** `feature/phase-3__io-clients__base`

**Files:**
- Create: `src/llm.ts`, `tests/llm.test.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase3-task2__nexus-client
git checkout -b feature/phase3-task3__llm-client
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/llm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleLlmClient } from '../src/llm.js';

describe('OpenAICompatibleLlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockRes(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }

  it('returns choices[0].message.content', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockRes({ choices: [{ message: { content: 'feat: add X' } }] }),
    );
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'ollama');
    const out = await client.chat(
      { system: 's', user: 'u', model: 'qwen' },
      { timeoutMs: 60000 },
    );
    expect(out).toBe('feat: add X');
  });

  it('POST /chat/completions with OpenAI-compatible body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockRes({ choices: [{ message: { content: 'x' } }] }),
    );
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await client.chat(
      { system: 'sys', user: 'usr', model: 'qwen' },
      { timeoutMs: 60000 },
    );
    const [url, opts] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect((opts!.headers as Record<string, string>)['Authorization']).toBe('Bearer k');
    const body = JSON.parse(opts!.body as string);
    expect(body.model).toBe('qwen');
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('throws on empty choices', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [] }));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/empty choices/);
  });

  it('throws on invalid message shape', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({ choices: [{ message: {} }] }));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow();
  });

  it('throws on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({}, false, 401));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/LLM API error: 401/);
  });

  it('throws on 500', async () => {
    vi.mocked(fetch).mockResolvedValue(mockRes({}, false, 500));
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 1000 }),
    ).rejects.toThrow(/LLM API error: 500/);
  });

  it('aborts on timeout', async () => {
    vi.mocked(fetch).mockImplementation(((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as never);
    const client = new OpenAICompatibleLlmClient('http://localhost:11434/v1', 'k');
    await expect(
      client.chat({ system: 's', user: 'u', model: 'm' }, { timeoutMs: 10 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
npm test -- tests/llm.test.ts
```

- [ ] **Step 4: `src/llm.ts` を実装**

```typescript
import type { ChatRequest, LlmClientPort } from './types.js';

interface ChoiceShape {
  message?: { content?: unknown };
}

function extractContent(data: unknown): string {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('choices' in data) ||
    !Array.isArray((data as { choices: unknown }).choices)
  ) {
    throw new Error('Invalid LLM response: choices missing');
  }
  const choices = (data as { choices: ChoiceShape[] }).choices;
  if (choices.length === 0) {
    throw new Error('LLM returned empty choices');
  }
  const first = choices[0];
  if (!first || typeof first.message?.content !== 'string') {
    throw new Error('LLM returned invalid message content');
  }
  return first.message.content;
}

export class OpenAICompatibleLlmClient implements LlmClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          stream: false,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`LLM API error: ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    return extractContent(data);
  }
}
```

- [ ] **Step 5: テスト PASS を確認**

```bash
npm test -- tests/llm.test.ts
```

Expected: 7 件全て PASS

- [ ] **Step 6: 全体テスト**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
git add src/llm.ts tests/llm.test.ts
git commit -m "feat: add OpenAI-compatible LLM client with Bearer auth and timeout"
```

- [ ] **Step 8: Push と Draft PR 作成**

```bash
git push -u origin feature/phase3-task3__llm-client

gh pr create --draft \
  --base feature/phase-3__io-clients__base \
  --head feature/phase3-task3__llm-client \
  --title "feat: LLM クライアント（OpenAI 互換）を追加" \
  --body "$(cat <<'EOF'
## Summary
- POST {baseUrl}/chat/completions、Bearer 認証、temperature 0.2、stream false
- choices[0].message.content を抽出、不正形式で throw
- タイムアウトは AbortController

## Test plan
- [ ] llm.test.ts 7 件 PASS
- [ ] 全体テスト green
EOF
)"
```

- [ ] **Step 9: Phase 3 全体の Draft PR を作成（master 向け）**

```bash
gh pr create --draft \
  --base master \
  --head feature/phase-3__io-clients__base \
  --title "feat: Phase 3 — I/O クライアント層" \
  --body "$(cat <<'EOF'
## Summary
- NodeGitClient / HttpNexusClient / OpenAICompatibleLlmClient を実装
- 全クライアントでタイムアウト・エラー・引数インジェクションに対処

## Test plan
- [ ] 全 Task PR マージ済み
- [ ] 本ブランチ CI が green
EOF
)"
```

---

## Phase 4: CLI Entrypoint + 受け入れ基準検証

**Phase Branch:** `feature/phase-4__cli-entrypoint__base`（`master` から派生、PR ベース = `master`）

**Goal:** Phase 2/3 で揃ったパーツを `src/bin/nxc.ts` で組み立てる。対話フロー（`@clack/prompts`）・キャンセル安全性・dry-run・再生成・コミット実行・ヘルプ・バージョン表示を実装し、設計書 §13 の全受け入れ基準を満たす。

**Milestone:** `nxc` が実際に動作し、master マージで設計書の全受け入れ基準がクリアされる。

### Task 4-1: エントリポイント骨格（フラグ・ヘルプ・バージョン）

**Branch:** `feature/phase4-task1__entrypoint-skeleton` (from `feature/phase-4__cli-entrypoint__base`)
**PR Target:** `feature/phase-4__cli-entrypoint__base`

**Files:**
- Create: `src/bin/nxc.ts`

- [ ] **Step 1: Phase ブランチと Task ブランチの作成**

```bash
git checkout master
git pull origin master
git checkout -b feature/phase-4__cli-entrypoint__base
git push -u origin feature/phase-4__cli-entrypoint__base
git checkout -b feature/phase4-task1__entrypoint-skeleton
```

- [ ] **Step 2: `src/bin/nxc.ts` の骨格を作成**

```typescript
#!/usr/bin/env node
import { parseFlags } from '../flags.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';

const HELP_TEXT = `Usage: nxc [options]

Generate a Conventional Commits message from git diff using a local LLM
and Nexus context.

Options:
  --staged       Target staged diff (default)
  --unstaged     Target unstaged diff
  --all          Target both staged + unstaged
  --lang <ja|en> Output language (default: ja)
  --model <name> Override LLM model name
  --dry-run      Print message to stdout without committing
  --no-context   Skip Nexus context lookup
  -h, --help     Show this help
  -v, --version  Show version
`;

const VERSION = '0.1.0';

export async function main(argv: string[]): Promise<number> {
  let flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    logger.error((err as Error).message);
    return 2;
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  let config;
  try {
    config = loadConfig(process.env, flags);
  } catch (err) {
    logger.error((err as Error).message);
    return 2;
  }

  logger.info(`(skeleton) mode=${config.diffMode} lang=${config.lang} dryRun=${config.dryRun}`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    logger.error((err as Error).message);
    process.exit(1);
  },
);
```

- [ ] **Step 3: `npm run build` が成功することを確認**

```bash
npm run build
```

Expected: `dist/bin/nxc.js` が生成され実行権限が付く

- [ ] **Step 4: ヘルプ・バージョン・不正フラグを手動確認**

```bash
node dist/bin/nxc.js --help
# Expected: Usage: nxc ... が出力され exit 0

node dist/bin/nxc.js --version
# Expected: 0.1.0 が出力され exit 0

node dist/bin/nxc.js --bogus
echo "exit=$?"
# Expected: ✖ Unknown flag: --bogus が stderr に出て exit=2
```

- [ ] **Step 5: typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: コミット**

```bash
git add src/bin/nxc.ts
git commit -m "feat(cli): add nxc entrypoint skeleton with --help, --version, flag parsing"
```

- [ ] **Step 7: Push と Draft PR 作成**

```bash
git push -u origin feature/phase4-task1__entrypoint-skeleton

gh pr create --draft \
  --base feature/phase-4__cli-entrypoint__base \
  --head feature/phase4-task1__entrypoint-skeleton \
  --title "feat(cli): エントリポイント骨格（help/version/flag parsing）" \
  --body "$(cat <<'EOF'
## Summary
- src/bin/nxc.ts に shebang 付きエントリを追加
- --help / --version / 不正フラグ / env 不正時の exit コード実装
- 後続 Task で対話フローを上乗せ

## Test plan
- [ ] npm run build が成功
- [ ] 手動で --help / --version / 不正フラグの挙動確認
EOF
)"
```

---

### Task 4-2: 対話フロー・Nexus/LLM 連携・コミット実行

**Branch:** `feature/phase4-task2__interactive-flow` (from `feature/phase4-task1__entrypoint-skeleton`)
**PR Target:** `feature/phase-4__cli-entrypoint__base`

**Files:**
- Modify: `src/bin/nxc.ts`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase4-task1__entrypoint-skeleton
git checkout -b feature/phase4-task2__interactive-flow
```

- [ ] **Step 2: `src/bin/nxc.ts` を対話フロー込みに書き換え**

```typescript
#!/usr/bin/env node
import * as clack from '@clack/prompts';
import { parseFlags } from '../flags.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { NodeGitClient } from '../git.js';
import { HttpNexusClient } from '../nexus-client.js';
import { OpenAICompatibleLlmClient } from '../llm.js';
import { extract as extractKeywords } from '../keywords.js';
import { build as buildTruncated } from '../truncate.js';
import { build as buildPrompt } from '../prompt.js';
import type {
  Config,
  GitClient,
  LlmClientPort,
  NexusClientPort,
  NexusResult,
} from '../types.js';

const HELP_TEXT = `Usage: nxc [options]

Generate a Conventional Commits message from git diff using a local LLM
and Nexus context.

Options:
  --staged       Target staged diff (default)
  --unstaged     Target unstaged diff
  --all          Target both staged + unstaged
  --lang <ja|en> Output language (default: ja)
  --model <name> Override LLM model name
  --dry-run      Print message to stdout without committing
  --no-context   Skip Nexus context lookup
  -h, --help     Show this help
  -v, --version  Show version
`;

const VERSION = '0.1.0';

interface Deps {
  git: GitClient;
  nexus: NexusClientPort;
  llm: LlmClientPort;
}

async function generate(
  config: Config,
  deps: Deps,
  diff: string,
  files: string[],
  hint: string | undefined,
): Promise<string> {
  const keywords = extractKeywords(diff);
  let contexts: NexusResult[] = [];
  if (config.useContext) {
    try {
      const query = [...keywords, ...files].join(' ');
      contexts = await deps.nexus.search(
        { query, files },
        { timeoutMs: config.nexusTimeoutMs },
      );
    } catch (err) {
      logger.warn(
        `Nexus サーバーに接続できませんでした (${config.nexusUrl})`,
      );
      logger.dim(`   ${(err as Error).message}`);
      logger.warn('   コンテキストなしで続行します。');
    }
  }

  const truncated = buildTruncated({
    diff,
    contexts,
    maxChars: config.maxChars,
  });
  const { system, user } = buildPrompt({
    diff: truncated.diff,
    contexts: truncated.contexts,
    files,
    lang: config.lang,
    hint,
  });

  const spinner = clack.spinner();
  spinner.start('LLM でコミットメッセージ生成中...');
  try {
    const result = await deps.llm.chat(
      { system, user, model: config.llmModel },
      { timeoutMs: config.llmTimeoutMs },
    );
    spinner.stop('生成完了');
    return result.trim();
  } catch (err) {
    spinner.stop('生成失敗');
    logger.error(`ローカル LLM に接続できません: ${(err as Error).message}`);
    throw Object.assign(new Error('llm-failed'), { exitCode: 3 });
  }
}

async function interactive(
  config: Config,
  deps: Deps,
  diff: string,
  files: string[],
): Promise<number> {
  clack.intro('nxc — Nexus Commit');
  let hint: string | undefined;
  let message = await generate(config, deps, diff, files, hint);

  for (;;) {
    clack.note(message, '生成されたコミットメッセージ');
    const action = await clack.select({
      message: 'どうしますか？',
      options: [
        { value: 'commit', label: '採用してコミット' },
        { value: 'edit', label: '編集してからコミット' },
        { value: 'regen', label: '再生成（追加指示）' },
        { value: 'abort', label: '中止' },
      ],
    });

    if (clack.isCancel(action) || action === 'abort') {
      clack.cancel('中止しました');
      return 0;
    }

    if (action === 'edit') {
      const edited = await clack.text({
        message: 'メッセージを編集してください',
        initialValue: message,
      });
      if (clack.isCancel(edited)) {
        clack.cancel('中止しました');
        return 0;
      }
      message = edited;
    }

    if (action === 'regen') {
      const nh = await clack.text({
        message: '追加の指示（例: もっと簡潔に）',
        placeholder: '（なしでも可）',
        defaultValue: '',
      });
      if (clack.isCancel(nh)) {
        clack.cancel('中止しました');
        return 0;
      }
      hint = nh || undefined;
      message = await generate(config, deps, diff, files, hint);
      continue;
    }

    // action === 'commit' or after edit
    if (config.dryRun) {
      process.stdout.write(message + '\n');
      clack.outro('--dry-run: コミットをスキップしました');
      return 0;
    }
    try {
      await deps.git.commit(message);
    } catch (err) {
      clack.cancel(`コミット失敗: ${(err as Error).message}`);
      return 1;
    }
    clack.outro('コミットしました');
    return 0;
  }
}

export async function main(argv: string[]): Promise<number> {
  let flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    logger.error((err as Error).message);
    return 2;
  }
  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  let config;
  try {
    config = loadConfig(process.env, flags);
  } catch (err) {
    logger.error((err as Error).message);
    return 2;
  }

  const deps: Deps = {
    git: new NodeGitClient(),
    nexus: new HttpNexusClient(config.nexusUrl),
    llm: new OpenAICompatibleLlmClient(config.llmUrl, config.llmApiKey),
  };

  if (!(await deps.git.isRepo())) {
    logger.error('Not a git repository');
    return 2;
  }

  const { diff, files } = await deps.git.getDiff(config.diffMode);
  if (!diff.trim()) {
    logger.info('変更がありません');
    return 0;
  }

  try {
    return await interactive(config, deps, diff, files);
  } catch (err) {
    const code = (err as { exitCode?: number }).exitCode ?? 1;
    return code;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    logger.error((err as Error).message);
    process.exit(1);
  },
);
```

- [ ] **Step 3: `npm run build` が成功することを確認**

```bash
npm run build
```

Expected: エラーなく `dist/bin/nxc.js` が更新される

- [ ] **Step 4: 全体テスト**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 全 PASS

- [ ] **Step 5: 手動 E2E: 非 git ディレクトリ**

```bash
cd /tmp && mkdir -p nxc-manual-check && cd nxc-manual-check
node "$OLDPWD/dist/bin/nxc.js" ; echo "exit=$?"
# Expected: ✖ Not a git repository → exit=2
cd "$OLDPWD"
```

- [ ] **Step 6: 手動 E2E: 変更がない状態**

```bash
# プロジェクト内で（staged が空の状態で）
node dist/bin/nxc.js
# Expected: ℹ 変更がありません → exit=0
```

- [ ] **Step 7: 手動 E2E: dry-run（Nexus/LLM 未起動状態）**

Nexus と LLM が起動していない前提なので、この手順は Nexus が落ちても警告だけ出て LLM 接続で fatal になることを確認する（設計書の挙動）。完全 E2E は Phase 4-3 で実施する。

```bash
# 何か変更をステージして
echo "// trivial change" >> README.md
git add README.md
node dist/bin/nxc.js --dry-run --no-context
# Expected: LLM 未起動なら ✖ ローカル LLM に接続できません → exit=3
#           LLM 起動済みなら対話フローに入る（Ctrl+C で中止 → commit されない）
git reset HEAD README.md
git checkout README.md
```

- [ ] **Step 8: コミット**

```bash
git add src/bin/nxc.ts
git commit -m "feat(cli): wire up interactive flow with Nexus/LLM and commit execution"
```

- [ ] **Step 9: Push と Draft PR 作成**

```bash
git push -u origin feature/phase4-task2__interactive-flow

gh pr create --draft \
  --base feature/phase-4__cli-entrypoint__base \
  --head feature/phase4-task2__interactive-flow \
  --title "feat(cli): 対話フロー・Nexus/LLM 連携・コミット実行" \
  --body "$(cat <<'EOF'
## Summary
- clack.select メニュー（採用/編集/再生成/中止）と isCancel ガード
- Nexus は失敗時に警告のみで contexts=[] へフォールバック
- LLM 失敗は exit 3、dry-run は stdout 出力のみ
- commit 直前まで isCancel チェックを入れキャンセル安全性を担保

## Test plan
- [ ] build / typecheck / lint / test が全て green
- [ ] 非 git / 変更なし / Ctrl+C / dry-run の挙動を手動確認
EOF
)"
```

---

### Task 4-3: README 更新 + 受け入れ基準の全項目検証

**Branch:** `feature/phase4-task3__readme-acceptance` (from `feature/phase4-task2__interactive-flow`)
**PR Target:** `feature/phase-4__cli-entrypoint__base`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Task ブランチの作成**

```bash
git checkout feature/phase4-task2__interactive-flow
git checkout -b feature/phase4-task3__readme-acceptance
```

- [ ] **Step 2: `README.md` を更新**

既存の `README.md` の内容を確認し、以下のセクションを追記（既存を保存しつつ差分的に追加）：

```markdown
## Usage

### Prerequisites
- Node.js 22+
- Local OpenAI-compatible LLM endpoint (Ollama / LM Studio / vLLM etc.)
- (Optional) Nexus search server at `NEXUS_API_URL` (defaults to `http://localhost:8080`)

### Install & run from source

```bash
npm ci
npm run build
node dist/bin/nxc.js --help
```

### Environment variables
See design doc §5.1.

### DevContainer
Open `.devcontainer/` with VS Code → "Reopen in Container".
On macOS/Windows, set the following instead of relying on `--network=host`:

```bash
export NEXUS_API_URL=http://host.docker.internal:8080
export NEXUS_COMMIT_LLM_URL=http://host.docker.internal:11434/v1
```
```

(ただし、既存の README に日本語記述があれば日本語で統一する。)

- [ ] **Step 3: 受け入れ基準（設計書 §13）を手動で検証**

チェックリスト（全てパスすることを確認）:

```text
1. [ ] DevContainer を開いてそのまま開発開始できる
2. [ ] staged な変更がある状態で `nxc` を実行し、Conventional Commits
       形式のメッセージが生成される（実際に LLM 接続して確認）
3. [ ] Nexus サーバー停止状態で `nxc` を実行しても警告のみで継続する
4. [ ] `--dry-run` 指定時はコミットが走らず stdout に出力される
5. [ ] `--lang en` 指定時に英語でメッセージが生成される
6. [ ] `npm run test` / `npm run typecheck` / `npm run lint` が全て成功
7. [ ] Ctrl+C でいつキャンセルしても commit が走らない
```

それぞれの検証コマンドの例：

```bash
# 6: 自動チェック
npm ci && npm run lint && npm run typecheck && npm test && npm run build

# 4: dry-run
echo "// dry-run test" >> SOMETHING.md && git add SOMETHING.md
node dist/bin/nxc.js --dry-run
# → メッセージが stdout に出て git log に変化なし
git restore --staged SOMETHING.md && git checkout SOMETHING.md

# 3: Nexus 停止状態
node dist/bin/nxc.js --dry-run
# → ⚠ Nexus サーバーに接続できませんでした が出る
```

手動確認できない項目（LLM 起動を要するもの）は README に「手動確認手順」として記載しておく。

- [ ] **Step 4: コミット**

```bash
git add README.md
git commit -m "docs: document usage, env variables, and devcontainer tips"
```

- [ ] **Step 5: Push と Draft PR 作成**

```bash
git push -u origin feature/phase4-task3__readme-acceptance

gh pr create --draft \
  --base feature/phase-4__cli-entrypoint__base \
  --head feature/phase4-task3__readme-acceptance \
  --title "docs: README に利用方法と受け入れ基準検証手順を追加" \
  --body "$(cat <<'EOF'
## Summary
- README に Usage / Prerequisites / DevContainer tips を追加
- 設計書 §13 の受け入れ基準を手動検証した結果を反映

## Test plan
- [ ] 受け入れ基準 1〜7 を手動確認し全 PASS
EOF
)"
```

- [ ] **Step 6: Phase 4 全体の Draft PR を作成（master 向け）**

```bash
gh pr create --draft \
  --base master \
  --head feature/phase-4__cli-entrypoint__base \
  --title "feat: Phase 4 — CLI エントリポイントと受け入れ基準達成" \
  --body "$(cat <<'EOF'
## Summary
- src/bin/nxc.ts で対話フローを組み立て
- --help / --version / --dry-run / --lang / --no-context / Ctrl+C 安全性
- 設計書 §13 の受け入れ基準 1〜7 全てを満たす

## Test plan
- [ ] 全 Task PR マージ済み
- [ ] 受け入れ基準 1〜7 の手動確認
- [ ] 本ブランチ CI が green
EOF
)"
```

---

## Completion Summary

全 Phase / Task の完了条件：

| Phase | 完了条件 |
|---|---|
| 0 | `master` に CI ワークフローがマージされ、CI が稼働中 |
| 1 | scaffold + DevContainer が `master` にマージされ、`npm ci / test / typecheck / lint` が CI で green |
| 2 | 純粋ロジック 7 モジュールが `master` にマージされ、ユニットテスト 50 件以上が green |
| 3 | I/O クライアント 3 モジュールが `master` にマージされ、fetch/execFile モックベースのテストが green |
| 4 | `nxc` CLI が `master` にマージされ、設計書 §13 の受け入れ基準 1〜7 が全て満たされる |

### 受け入れ基準最終チェックリスト

- [ ] `nxc` を独立リポジトリで `.devcontainer/` を開けばそのまま開発開始可能
- [ ] staged な変更がある状態で `nxc` 実行 → Conventional Commits 形式のメッセージ生成
- [ ] Nexus 停止状態で `nxc` 実行 → 警告のみで継続成功
- [ ] `--dry-run` 時コミットが走らない
- [ ] `--lang en` 時に英語で生成
- [ ] `npm run test` / `npm run typecheck` / `npm run lint` が全て成功
- [ ] Ctrl+C でいつキャンセルしても commit が走らない
