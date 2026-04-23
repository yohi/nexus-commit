# Nexus Commit (`nxc`) 設計書

- **作成日**: 2026-04-23
- **対象リポジトリ**: `nexus-commit`（独立リポジトリ）
- **パッケージ名**: `@yohi/nexus-commit`
- **CLI コマンド**: `nxc`
- **ステータス**: 設計フェーズ確定（実装計画フェーズへ移行予定）

---

## 1. 目的とスコープ

### 1.1 目的

ローカルのインデックス検索基盤「Nexus」のエコシステムを拡張する CLI `nxc` を、完全に独立した新規リポジトリとして提供する。`git diff` と Nexus サーバーから取得する周辺コンテキストを組み合わせ、ローカル LLM に投げることで、高精度な Conventional Commits 準拠のコミットメッセージを生成する。外部 SaaS に一切コードを送信しないローカル完結を保証する。

### 1.2 MVP スコープ（本設計の対象）

- `nxc` 単一コマンドによる生成 → プレビュー → 対話編集 → 自動コミットの一気通貫フロー
- `git diff --staged` / `--unstaged` / `--all` のフラグ切替
- Nexus `/api/search` への問い合わせ（失敗時フォールバック付き）
- Ollama 等の OpenAI 互換 LLM エンドポイントへの接続（`/v1/chat/completions`）
- Conventional Commits v1.0.0 準拠・多言語（`ja` / `en`）出力
- 巨大 diff の安全な切り詰め（文字数ベース予算配分）
- 追加指示付き再生成（Human-in-the-Loop）
- スタンドアロン Devcontainer（Node.js 22）

### 1.3 非スコープ（MVP で対象外）

- 設定ファイル（`.nxcrc` 等）のサポート — env 変数と CLI フラグのみ
- AST ベースのキーワード抽出 — MVP は軽量ヒューリスティック（戦略 A）
- Nexus 以外の検索バックエンド
- `@clack/prompts` 対話フローの E2E テスト（`execa` 等を用いた将来追加は可）
- 複数サブコマンド（`nxc init` / `nxc config` 等）
- テレメトリ／使用状況分析

---

## 2. 意思決定の記録（ADR）

### 2.1 LLM バックエンドの抽象化: OpenAI 互換プロトコル

Ollama 専用 SDK ではなく、Ollama の OpenAI 互換エンドポイント `/v1/chat/completions` にネイティブ `fetch` で接続する。

- **採用理由**: Node 22 標準 `fetch` のみで依存ゼロ。LM Studio / vLLM / 任意の OpenAI 互換サーバーに URL 差し替えだけで対応可能。巨大フレームワーク排除の制約と整合。
- **棄却案**: `ollama` npm SDK — Ollama 固有で将来の拡張余地が狭い。

### 2.2 Nexus 問い合わせの前処理: 軽量ヒューリスティック（戦略 A）

diff のハンクから識別子っぽいトークンを正規表現で抽出し、頻度順上位 N 個 + 変更ファイルパス配列をクエリ化する。

- **採用理由**: 実装・テストが容易、依存ゼロ、言語差を気にしない。
- **棄却案**: tree-sitter 等の AST 解析 — ネイティブバインディング管理が重く MVP に不向き。クライアント側で全 diff を丸投げする案 — Nexus 側 API 負荷が大きくなる。
- **移行性**: `keywords.ts` が純粋関数で閉じているため、将来 AST 版に差し替え可能。

### 2.3 対話フロー: 追加指示付き再生成（B）+ CLI フラグで対象選択

プレビュー後のメニューは `[採用してコミット / 編集してからコミット / 再生成 / 中止]`。再生成時には自由入力による追加ヒント（例: "もっと簡潔に"）を受け付ける。対象の staged / unstaged 切替は CLI フラグ（`--staged` / `--unstaged` / `--all`）で吸収する。

- **採用理由**: Human-in-the-Loop を謳う以上、追加指示付き再生成はコア体験。
- **棄却案**: 起動時に対話で対象選択させる案 — 起動が遅く感じられる。フラグで十分。

### 2.4 コミット実行: 採用時に `git commit -m` を自動実行

`--dry-run` 指定時のみ stdout 出力に切り替える。Ctrl+C によるキャンセル時は絶対にコミットを走らせない。

---

## 3. アーキテクチャ

### 3.1 モジュール構成

単一プロセス CLI。I/O 層（git / Nexus / LLM / ターミナル）と純粋ロジック層を明確に分離する。

```
┌─────────────────────────────────────────────────────────┐
│ src/bin/nxc.ts  (entrypoint: flags解釈 + 対話フロー制御) │
└───────────┬──────────────────────────────────┬──────────┘
            │                                  │
    ┌───────▼──────┐  ┌─────────────┐   ┌──────▼──────┐
    │ git.ts       │  │ nexus-client│   │ llm.ts      │
    │ (child_proc) │  │ .ts (fetch) │   │ (fetch)     │
    └───────┬──────┘  └──────┬──────┘   └──────┬──────┘
            │                │                 │
            └──────┬─────────┴────────┬────────┘
                   ▼                  ▼
            ┌─────────────┐   ┌─────────────────┐
            │ keywords.ts │   │ truncate.ts     │
            │ (純粋)       │   │ (純粋)           │
            └─────────────┘   └─────────────────┘
                          ▲
                          │
                   ┌──────┴───────┐
                   │ prompt.ts    │
                   │ (純粋)        │
                   └──────────────┘

            ┌─────────────┐   ┌─────────────────┐
            │ config.ts   │   │ logger.ts       │
            │ (env解釈)    │   │ (picocolors)    │
            └─────────────┘   └─────────────────┘
```

### 3.2 各モジュールの責務

| モジュール | 責務 | 依存 | テスト方針 |
|---|---|---|---|
| `src/bin/nxc.ts` | フラグ解析、対話ループ、エラー表示、終了コード | `@clack/prompts`, 各 I/O モジュール | 将来 E2E |
| `src/git.ts` | `git diff`・`git commit`・`isRepo` の実行、変更ファイル一覧 | `node:child_process` | `child_process.execFile` をモック |
| `src/nexus-client.ts` | `POST /api/search` の呼び出し、タイムアウト、AbortController | `fetch` | `vi.stubGlobal('fetch')` |
| `src/llm.ts` | `POST /v1/chat/completions`、レスポンス整形 | `fetch` | `vi.stubGlobal('fetch')` |
| `src/keywords.ts` | diff 文字列 → 識別子候補配列（頻度順上位 N） | なし（純粋） | 純粋ユニット |
| `src/truncate.ts` | diff + context の総文字数を上限内に切り詰め（予算配分） | なし（純粋） | 純粋ユニット |
| `src/prompt.ts` | system / user プロンプト生成（Conventional Commits 指示 + 言語 + ヒント） | なし（純粋） | 純粋ユニット |
| `src/config.ts` | env + flags → `Config` へ解決、バリデーション | `process.env` | 環境差替で単体 |
| `src/flags.ts` | 手書き軽量 CLI パーサ | なし | 純粋ユニット |
| `src/logger.ts` | 色付き出力、`info` / `warn` / `error` / `dim` | `picocolors` | スモーク |
| `src/types.ts` | 共通型定義（`Config`, `NexusResult`, `GeneratedMessage` 等） | なし | 型チェックのみ |

### 3.3 DI ポリシー

I/O 層（`git` / `nexus-client` / `llm`）はインターフェースとして型定義し、`bin/nxc.ts` で具象実装を注入する。テスト時は fake を差し込めるようにする。

```ts
export interface GitClient {
  isRepo(): Promise<boolean>;
  getDiff(mode: DiffMode): Promise<DiffResult>;
  commit(message: string): Promise<void>;
}

export interface NexusClient {
  search(req: NexusSearchRequest, opts: { timeoutMs: number }): Promise<NexusResult[]>;
}

export interface LlmClient {
  chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string>;
}
```

---

## 4. データフロー

### 4.1 実行シーケンス

```
1. parseFlags(argv)
   → Flags { mode, dryRun, lang?, model?, useContext, ... }

2. loadConfig(env, flags)
   → Config（型付き、全デフォルト解決済み）

3. git.isRepo() → false なら fatal (exit 2)

4. git.getDiff(config.diffMode)
   → { diff: string, files: string[] }
   ├─ diff が空 → "変更がありません" を表示して exit 0

5. keywords.extract(diff)
   → string[]  （識別子頻度上位 N + キーワード除外）

6. if (config.useContext):
     try nexusClient.search({ query, files }, { timeoutMs })
       → NexusResult[]
     catch: logger.warn(...), contexts = []
   else contexts = []

7. truncate.build({ diff, contexts, maxChars })
   → { diff', contexts' }  (予算配分: diff 60% / contexts 40%)

8. prompt.build({ diff', contexts', lang, hint? })
   → { system, user }

9. llmClient.chat({ system, user, model }, { timeoutMs })
   → message: string
   ├─ 失敗時 fatal (exit 3)

10. UI ループ: renderPreview → 選択
    ├ "採用してコミット"        → git.commit(message) → exit 0
    ├ "編集してからコミット"    → clack.text(initialValue=message) → git.commit(edited) → exit 0
    ├ "再生成 (追加指示)"       → clack.text(hint) → 8 へ戻る（hint を prompt に合流）
    └ "中止"                    → exit 0

11. --dry-run の場合: 10 の commit を行わず stdout へ出力して exit 0
```

### 4.2 予算配分ルール（`truncate.ts`）

総枠 `maxChars` を `diff : contexts = 60 : 40` で分割。

- **diff**: 予算超過時は**末尾から**切り詰める（ファイルヘッダ `diff --git` を必ず残す）。ヘッダ各々の `diff --git ...` 〜 次のヘッダ直前までを「ブロック」とし、末尾ブロックから落とす。ブロック内で切る場合も末尾から。
- **contexts**: 予算超過時は `content` 長い順に落とす（ファイル単位で削除、部分切り詰めはしない）。
- **両方 0 文字**の状態は想定しない（diff が空なら 4 で早期 exit）。

---

## 5. 設定・CLI

### 5.1 環境変数

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `NEXUS_API_URL` | `http://localhost:8080` | Nexus サーバーのベース URL |
| `NEXUS_COMMIT_LLM_URL` | `http://localhost:11434/v1` | OpenAI 互換エンドポイントのベース URL |
| `NEXUS_COMMIT_LLM_MODEL` | `qwen2.5-coder:7b` | 使用モデル名 |
| `NEXUS_COMMIT_LLM_API_KEY` | `ollama` | OpenAI 互換のための形式上のキー |
| `NEXUS_COMMIT_LANG` | `ja` | 生成言語（`ja` / `en`） |
| `NEXUS_COMMIT_MAX_CHARS` | `24000` | diff + context の合計文字数上限 |
| `NEXUS_COMMIT_NEXUS_TIMEOUT_MS` | `5000` | Nexus API タイムアウト |
| `NEXUS_COMMIT_LLM_TIMEOUT_MS` | `60000` | LLM タイムアウト |

### 5.2 CLI フラグ

| フラグ | 挙動 |
|---|---|
| `--staged`（デフォルト） | `git diff --staged` を対象 |
| `--unstaged` | unstaged の diff を対象 |
| `--all` | staged + unstaged の和集合 |
| `--lang <ja\|en>` | `NEXUS_COMMIT_LANG` を上書き |
| `--model <name>` | モデル名を上書き |
| `--dry-run` | コミット実行せずメッセージを stdout |
| `--no-context` | Nexus 問い合わせをスキップ（強制オフライン） |
| `-h` / `--help` | ヘルプ |
| `-v` / `--version` | バージョン |

### 5.3 優先順位

`CLI フラグ > 環境変数 > デフォルト`。`config.ts` の `loadConfig(env, flags)` を純粋関数として実装し、単体テスト可能にする。

### 5.4 `Config` 型

```ts
export interface Config {
  nexusUrl: string;
  llmUrl: string;
  llmModel: string;
  llmApiKey: string;
  lang: 'ja' | 'en';
  maxChars: number;
  nexusTimeoutMs: number;
  llmTimeoutMs: number;
  diffMode: 'staged' | 'unstaged' | 'all';
  dryRun: boolean;
  useContext: boolean;
}
```

---

## 6. 外部インターフェース

### 6.1 Nexus サーバー API（クライアント側コントラクト）

- **エンドポイント**: `POST {NEXUS_API_URL}/api/search`
- **リクエスト**:
  ```json
  {
    "query": "抽出キーワードをスペース区切りで結合した文字列",
    "files": ["src/foo.ts", "src/bar.ts"]
  }
  ```
- **レスポンス**:
  ```json
  {
    "results": [
      { "file": "src/foo.ts", "content": "関連コンテキスト本文" }
    ]
  }
  ```
- **タイムアウト**: 5 秒（既定、可変）
- **失敗時**: 接続不可・5xx・4xx・タイムアウトのいずれも「警告 + contexts=[]」で続行

### 6.2 ローカル LLM API（OpenAI 互換）

- **エンドポイント**: `POST {NEXUS_COMMIT_LLM_URL}/chat/completions`
- **リクエスト**:
  ```json
  {
    "model": "qwen2.5-coder:7b",
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user",   "content": "..." }
    ],
    "stream": false,
    "temperature": 0.2
  }
  ```
- **ヘッダ**: `Authorization: Bearer {llmApiKey}`
- **レスポンス**: OpenAI 互換（`choices[0].message.content` を使用）
- **タイムアウト**: 60 秒（既定、可変）
- **失敗時**: fatal（exit 3）。stderr にエラー概要を出力。

---

## 7. プロンプト設計

### 7.1 system プロンプト（`ja` 例）

```
あなたは熟練ソフトウェアエンジニアです。
以下の git diff と関連コンテキストを読み、Conventional Commits v1.0.0 に厳格に準拠した
コミットメッセージを1件だけ、日本語で生成してください。

ルール:
- type は feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert のいずれか
- scope は変更対象の主要なモジュール名・パッケージ名。不要なら省略
- description は命令形で簡潔に
- 本文が必要なら空行を1行挟んで記述
- 破壊的変更は BREAKING CHANGE: フッターを付与
- メッセージ以外のテキスト・コードブロック記号・説明は絶対に出力しない
```

### 7.2 user プロンプト構造

````
# 変更ファイル
<files をリスト>

# 関連コンテキスト        ← contexts が空のときセクション自体を省略
---
file: src/foo.ts
content:
<content>
---

# Diff
```diff
<truncated diff>
```

# 追加の指示              ← hint があるときのみ
<hint>
````

### 7.3 言語切替

`lang: 'en'` のときは system プロンプトの「日本語で生成」を "in English" に置換し、残りは同一。言語を LLM 側に委ねず、明示的にプロンプト内で指定する。

---

## 8. エラー処理・堅牢性

### 8.1 エラー分類と対応

| 発生箇所 | 異常 | 方針 | exit |
|---|---|---|---|
| `git.isRepo` | 非 git ディレクトリ | fatal、明快な案内 | 2 |
| `git.getDiff` | diff が空 | 正常終了（"変更がありません"） | 0 |
| `git.commit` | pre-commit フック失敗等 | stderr 表示、中断 | 1 |
| `nexusClient.search` | 接続不可 / 5xx / 4xx / タイムアウト | 警告のみ、contexts=[] で続行 | - |
| `llmClient.chat` | 接続不可 / タイムアウト | fatal、"ローカル LLM に接続できません" | 3 |
| `llmClient.chat` | 5xx / 不正レスポンス | fatal、レスポンス概要出力 | 3 |
| Ctrl+C | `@clack/prompts.isCancel` | クリーン終了、commit しない | 0 |
| 設定値不正 | 未サポート lang 等 | 起動時バリデーションで fatal | 2 |

### 8.2 タイムアウト実装パターン

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const res = await fetch(url, { signal: controller.signal, /* ... */ });
  // ...
} finally {
  clearTimeout(timer);
}
```

### 8.3 Nexus フォールバック時 UX

```
⚠  Nexus サーバーに接続できませんでした (http://localhost:8080)
   コンテキストなしで続行します。
```

`--no-context` 指定時は警告も出さず最初からスキップ。

### 8.4 入力サニタイズ

- diff 内の ANSI エスケープシーケンスは `prompt.ts` で除去
- Nexus から返る `content` の制御文字・CRLF は LF に正規化してからプロンプトへ埋め込み

### 8.5 キャンセル安全性（重要）

`@clack/prompts` の各プロンプトは `isCancel(result)` で判定できる。どの段階でキャンセルされても **必ず `git commit` より前に exit する**。これが本 CLI の最重要安全保証。

---

## 9. テスト戦略

### 9.1 テスト階層

| 階層 | 対象 | アプローチ | 目標カバレッジ |
|---|---|---|---|
| 単体（純粋） | `keywords` / `truncate` / `prompt` / `config` / `flags` | 入出力検証 | 95%+ |
| 単体（I/O） | `nexus-client` / `llm` | `vi.stubGlobal('fetch')` | 主要分岐 |
| 単体（git） | `git` | `vi.mock('node:child_process')` | 主要コマンド |
| 対話（将来） | 対話フロー | MVP 外。将来 `execa` 等で E2E | — |

### 9.2 重要テストケース（抜粋）

**`keywords.extract(diff)`**
- 追加行からのみ識別子を抽出（削除行 `-` は無視）
- diff ヘッダ（`+++ b/path`）行から識別子を拾わない
- 頻度順にソート、TypeScript 予約語（`const` / `function` 等）を除外
- 上限 N 件で打ち切り

**`truncate.build({ diff, contexts, maxChars })`**
- 合計が `maxChars` 以内なら無変更
- 超過時 diff 予算内に収まるよう末尾ブロックから削除（`diff --git` ヘッダは残す）
- contexts 超過時は長い順に完全削除
- 空配列・`maxChars=0` のエッジケース

**`prompt.build({ diff, contexts, lang, hint? })`**
- `lang` に応じて言語指示が切り替わる
- Conventional Commits の型一覧を system に含む
- contexts 空のときセクション自体を省略
- hint 指定時に user prompt 末尾へ追記

**`config.load(env, flags)`**
- フラグが env を上書き
- 未指定時はデフォルト
- 不正 `lang` / `maxChars` で throw
- `--no-context` → `useContext: false`

**`nexus-client.search(...)`**
- 正常レスポンスを `NexusResult[]` に整形
- 5xx / 4xx / タイムアウトを throw（呼び出し側が catch しフォールバック）
- レスポンス JSON 不正でも throw

**`llm.chat(...)`**
- `choices[0].message.content` を返す
- `choices` 空で throw
- 401 / 500 / タイムアウトで throw

### 9.3 ファイル配置

```
tests/
├── keywords.test.ts
├── truncate.test.ts
├── prompt.test.ts
├── config.test.ts
├── flags.test.ts
├── nexus-client.test.ts
├── llm.test.ts
└── git.test.ts
```

`src/*.ts` と 1:1 対応。Vitest の `include: ['tests/**/*.test.ts']` でルーティング。

### 9.4 npm scripts

- `npm run test` — Vitest 1 回実行
- `npm run test:watch` — 開発時
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — tsc で `dist/` へ出力 + shebang 保全

---

## 10. ディレクトリ構造（最終成果物）

```
nexus-commit/
├── .devcontainer/
│   ├── devcontainer.json          # Node 22 / TS 開発環境
│   └── Dockerfile                 # node:22-bookworm ベース
├── .vscode/
│   └── extensions.json            # 推奨拡張（任意）
├── src/
│   ├── bin/
│   │   └── nxc.ts                 # エントリポイント（shebang + 対話フロー）
│   ├── config.ts
│   ├── flags.ts
│   ├── git.ts
│   ├── keywords.ts
│   ├── nexus-client.ts
│   ├── llm.ts
│   ├── truncate.ts
│   ├── prompt.ts
│   ├── logger.ts
│   └── types.ts
├── tests/
│   ├── keywords.test.ts
│   ├── truncate.test.ts
│   ├── prompt.test.ts
│   ├── config.test.ts
│   ├── flags.test.ts
│   ├── nexus-client.test.ts
│   ├── llm.test.ts
│   └── git.test.ts
├── dist/                          # gitignore
├── .editorconfig
├── eslint.config.js               # flat config
├── .gitignore
├── .nvmrc                         # "22"
├── .prettierrc.json
├── LICENSE                        # 既存
├── README.md                      # 既存
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 10.1 主要設定の要点

**`package.json`**

- `"type": "module"` / `"engines": { "node": ">=22" }`
- `"bin": { "nxc": "./dist/bin/nxc.js" }`
- `"files": ["dist"]`
- dependencies: `@clack/prompts`, `picocolors`
- devDependencies: `typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`, `tsx`
- scripts: `build` / `dev` (`tsx src/bin/nxc.ts`) / `test` / `test:watch` / `lint` / `typecheck` / `format` / `prepublishOnly`

**`tsconfig.json`**

- `"module": "NodeNext"` / `"moduleResolution": "NodeNext"`
- `"target": "ES2022"` / `"lib": ["ES2023"]`
- `"strict": true` / `"noUncheckedIndexedAccess": true`
- `"outDir": "dist"` / `"rootDir": "src"`
- shebang 保持: `src/bin/nxc.ts` 冒頭に `#!/usr/bin/env node`、`build` スクリプト末尾で `chmod +x dist/bin/nxc.js`

**`.devcontainer/Dockerfile`**

- `FROM node:22-bookworm`
- `git` / `curl` / `ca-certificates` を apt で追加
- 非 root `node` ユーザーを利用
- `WORKDIR /workspace`

**`.devcontainer/devcontainer.json`**

- `"build": { "dockerfile": "Dockerfile" }`
- `"postCreateCommand": "npm ci"`
- `"customizations.vscode.extensions": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode", "vitest.explorer"]`
- `"remoteUser": "node"`
- `"runArgs": ["--network=host"]`（ホスト上の Nexus / Ollama へアクセス）

---

## 11. リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| Nexus API 仕様が将来変わる | コンテキスト取得崩壊 | `nexus-client.ts` に閉じ込め、失敗時は警告のみで続行 |
| モデルがプロンプト指示を守らず説明文を混入 | コミットメッセージ不正 | `temperature=0.2`、system で「メッセージ以外出力禁止」を明記、受領後に簡易バリデーション |
| 巨大 diff でモデル崩壊 | 無意味な出力 | `truncate.ts` の文字数予算配分で防御。`maxChars` は env で調整可能 |
| `child_process` 経由の git 実行で引数エスケープミス | コマンドインジェクション | `spawn` / `execFile` を使用し、シェル経由実行（`exec`）を避ける。ユーザー入力を引数として渡さない |
| Ctrl+C 中に commit が走る | 意図しないコミット | `isCancel` 判定をメインループ全段で実施、commit 直前にも再確認 |
| tree-sitter 等への将来拡張 | 設計ロックイン | `keywords.ts` は純粋関数・単一エクスポート `extract(diff): string[]` で差し替え容易 |

---

## 12. 将来拡張（非スコープ、参考）

- 設定ファイル（`.nxcrc` / `nxc.config.ts`）対応
- AST ベースのキーワード抽出（`tree-sitter` / `@swc/core`）
- `nxc config` / `nxc init` サブコマンド
- git hooks 連携（`prepare-commit-msg`）
- 対話フローの E2E テスト（`execa` ベース）
- ストリーミングレスポンス（`stream: true` + 段階表示）

---

## 13. 受け入れ基準

1. `nxc` が独立リポジトリで `.devcontainer/` を開けばそのまま開発開始できる
2. staged な変更がある状態で `nxc` を実行し、Conventional Commits 形式のメッセージが生成される
3. Nexus サーバーを停止した状態で `nxc` を実行しても警告のみでフォールバック成功する
4. `--dry-run` 指定時はコミットが走らない
5. `--lang en` 指定時に英語で生成される
6. `npm run test` / `npm run typecheck` / `npm run lint` が全て成功する
7. Ctrl+C でいつキャンセルしても commit が走らない
