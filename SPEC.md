# Nexus Commit (`nxc`) 仕様書

- **作成日**: 2026-04-23
- **対象リポジトリ**: `nexus-commit`（独立リポジトリ）
- **パッケージ名**: `@yohi/nexus-commit`
- **CLI コマンド**: `nxc`
- **ステータス**: 実装完了

---

## 1. 目的とスコープ

### 1.1 目的

ローカルのインデックス検索基盤「Nexus」のエコシステムを拡張する CLI `nxc` を、完全に独立した新規リポジトリとして提供する。`git diff` と Nexus サーバーから取得する周辺コンテキストを組み合わせ、ローカル LLM に投げることで、高精度な Conventional Commits 準拠のコミットメッセージを生成する。外部 SaaS に一切コードを送信しないローカル完結を保証する。

### 1.2 スコープ

- `nxc` 単一コマンドによる生成 → プレビュー → 対話編集 → 自動コミットの一気通貫フロー
- `git diff --staged` / `--unstaged` / `--all` のフラグ切替
- Nexus `/api/search` への問い合わせ（失敗時フォールバック付き）
- Ollama 等の OpenAI 互換 LLM エンドポイントへの接続（`/v1/chat/completions`）
- Conventional Commits v1.0.0 準拠・多言語（`ja` / `en`）出力
- 巨大 diff の安全な切り詰め（js-tiktoken によるトークン数ベース予算配分）
- 追加指示付き再生成（Human-in-the-Loop）
- スタンドアロン Devcontainer（Node.js 22）
- zod による外部 API レスポンスの厳格な型検証
- `--doctor` 診断モード（モデル存在確認等の自動チェック）
- `.github/nxc.prompt.md` によるプロジェクト固有プロンプトの外部化
- Nexus daemon の自動起動（`--auto-start-nexus` / `NEXUS_AUTO_START=1`、opt-in）
### 1.3 非スコープ

- 設定ファイル（`.nxcrc` 等）のサポート — env 変数と CLI フラグのみ
- AST ベースのキーワード抽出 — 軽量ヒューリスティック（戦略 A）を使用
- Nexus 以外の検索バックエンド
- `@clack/prompts` 対話フローの E2E テスト（`execa` 等を用いた将来追加は可）
- 複数サブコマンド（`nxc init` / `nxc config` 等）
- テレメトリ／使用状況分析
- `--prompt-file <path>` フラグでの任意パス指定
- カスタムプロンプトの replace / target=user モード
- Llama/Qwen 等 SentencePiece 系専用トークナイザの統合
- `--doctor --json` の JSON 出力

---

## 2. 意思決定の記録（ADR）

### 2.1 LLM バックエンドの抽象化: OpenAI 互換プロトコル

Ollama 専用 SDK ではなく、Ollama の OpenAI 互換エンドポイント `/v1/chat/completions` にネイティブ `fetch` で接続する。

- **採用理由**: Node 22 標準 `fetch` のみで依存ゼロ。LM Studio / vLLM / 任意の OpenAI 互換サーバーに URL 差し替えだけで対応可能。巨大フレームワーク排除の制約と整合。

### 2.2 Nexus 問い合わせの前処理: 軽量ヒューリスティック（戦略 A）

diff のハンクから識別子っぽいトークンを正規表現で抽出し、頻度順上位 N 個 + 変更ファイルパス配列をクエリ化する。

- **採用理由**: 実装・テストが容易、依存ゼロ、言語差を気にしない。
- **移行性**: `keywords.ts` が純粋関数で閉じているため、将来 AST 版に差し替え可能。

### 2.3 対話フロー: 追加指示付き再生成（B）+ CLI フラグで対象選択

プレビュー後のメニューは `[採用してコミット / 編集してからコミット / 再生成 / 中止]`。再生成時には自由入力による追加ヒント（例: "もっと簡潔に"）を受け付ける。対象の staged / unstaged 切替は CLI フラグ（`--staged` / `--unstaged` / `--all`）で吸収する。

### 2.4 コミット実行: 採用時に `git commit -m` を自動実行

`--dry-run` 指定時のみ stdout 出力に切り替える。Ctrl+C によるキャンセル時は絶対にコミットを走らせない。

### 2.5 トークナイザ: `js-tiktoken` + `cl100k_base` 固定 + 安全マージン

`js-tiktoken` をインストールし `cl100k_base` エンコーダのみを使用。実トークン数は安全マージン (`× 0.85`) を掛けて overflow を防ぐ。非 OpenAI モデル（Qwen/Llama）の SentencePiece 系トークナイザ差分を吸収する。

### 2.6 zod スキーマ集約と検証

全 zod スキーマを `src/schemas.ts` に集約。OpenAI 互換 API はフィールドが追加される可能性があるため、`.passthrough()` を用いて未知のフィールドを許容し後方互換性を担保する。

### 2.7 カスタムプロンプト: append-only 方式

`.github/nxc.prompt.md` の内容を system プロンプト末尾に「# プロジェクト固有ルール」として連結する。コアルールの破壊を防ぐため append-only とし、最大 1000 トークンで切り詰める。

### 2.8 `--doctor` 診断モード

モデル一覧取得は OpenAI 互換 `GET {llmUrl}/models` のみを使用し、Ollama 固有のエンドポイントは使用しない。これにより SDK 互換性を保つ。

### 2.9 Config 型の破壊的変更: maxTokens

`Config.maxChars` を完全に削除し `Config.maxTokens` を追加。旧環境変数 `NEXUS_COMMIT_MAX_CHARS` は後方互換用エイリアスとしては機能しない（値は無視され `NEXUS_COMMIT_MAX_TOKENS` が必須となる）。ただし、旧環境変数が設定されている場合は起動時に `stderr` へ警告を出力し、移行を促すことで混乱を防止する。また、この破壊的変更に伴いパッケージバージョンを `1.0.0` へメジャーアップデートした。

**移行手順**:
- 以前: `NEXUS_COMMIT_MAX_CHARS=24000 nxc`
- 以降: `NEXUS_COMMIT_MAX_TOKENS=8192 nxc` （cl100k_base 基準のトークン数で指定）

---

## 3. アーキテクチャ

### 3.1 モジュール構成

単一プロセス CLI。I/O 層（git / Nexus / LLM / ターミナル / fs）と純粋ロジック層を明確に分離する。

```text
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
            └───────┬─────┘   └────────┬────────┘
                    │                  ▼
            ┌───────▼─────┐   ┌─────────────────┐
            │ prompt-file │   │ tokenizer.ts    │
            │ .ts (fs)    │   │ (js-tiktoken)   │
            └───────┬─────┘   └────────┬────────┘
                    │                  │
            ┌───────▼─────┐            │
            │ prompt.ts   │◄───────────┘
            │ (純粋)       │
            └──────────────┘

    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ config.ts   │   │ logger.ts   │   │ doctor.ts   │
    │ (env解釈)    │   │ (picocolors)│   │ (診断ロジック)│
    └─────────────┘   └─────────────┘   └─────────────┘
```

### 3.2 各モジュールの責務

| モジュール            | 責務                                                                      | 依存                                |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| `src/bin/nxc.ts`      | フラグ解析、対話ループ、エラー表示、終了コード                            | `@clack/prompts`, 各 I/O モジュール |
| `src/git.ts`          | `git diff`・`git commit`・`isRepo` の実行、変更ファイル一覧               | `node:child_process`                |
| `src/nexus-client.ts` | `POST /api/search` の呼び出し、タイムアウト、AbortController              | `fetch`                             |
| `src/llm.ts`          | `POST /v1/chat/completions`、`GET /v1/models`、レスポンス整形             | `fetch`                             |
| `src/keywords.ts`     | diff 文字列 → 識別子候補配列（頻度順上位 N）                              | なし（純粋）                        |
| `src/truncate.ts`     | diff + context の総トークン数を上限内に切り詰め（予算配分）               | なし（純粋）                        |
| `src/prompt.ts`       | system / user プロンプト生成（Conventional Commits 指示 + 言語 + ヒント） | なし（純粋）                        |
| `src/prompt-file.ts`  | `.github/nxc.prompt.md` の読み込み                                        | `node:fs`                           |
| `src/tokenizer.ts`    | `cl100k_base` によるトークン数計算と切り詰めロジック                      | `js-tiktoken`                       |
| `src/schemas.ts`      | 外部 API のレスポンス検証（Zod スキーマ）                                 | `zod`                               |
| `src/doctor.ts`       | API・モデルの疎通診断とレポート出力                                       | 各 I/O モジュール                   |
| `src/config.ts`       | env + flags → `Config` へ解決、バリデーション                             | env + flags 引数（純粋）            |
| `src/flags.ts`        | 手書き軽量 CLI パーサ                                                     | なし                                |
| `src/logger.ts`       | 色付き出力、`info` / `warn` / `error` / `dim`                             | `picocolors`                        |
| `src/types.ts`        | 共通型定義（`Config`, `NexusResult`, `GeneratedMessage` 等）              | なし                                |

### 3.3 DI ポリシー

I/O 層（`git` / `nexus-client` / `llm`）はインターフェースとして型定義し、`bin/nxc.ts` で具象実装を注入する。テスト時は fake を差し込めるようにする。

---

## 4. データフロー

### 4.1 実行シーケンス

```text
1. parseFlags(argv)
   → Flags { mode, dryRun, lang?, model?, useContext, doctor, ... }

2. loadConfig(env, flags)
   → Config（型付き、全デフォルト解決済み）

   (※ flags.doctor が true の場合はここで runDoctor を実行し、レポートを出力して終了)

3. prompt-file.loadPromptFile()
   → customSuffix 取得 (1000トークン超過時は末尾切り詰め + 警告)

4. git.isRepo() → false なら fatal (exit 2)

5. git.getDiff(config.diffMode)
   → { diff: string, files: string[] }
   ├─ diff が空 → "変更がありません" を表示して exit 0

6. keywords.extract(diff)
   → string[]  （識別子頻度上位 N + キーワード除外）

7. if (config.useContext):
     try nexusClient.search({ query, files }, { timeoutMs })
       → NexusResult[]
     catch: logger.warn(...), contexts = []
   else contexts = []

8. truncate.build({ diff, contexts, maxTokens })
   → { diff', contexts' }  (予算配分: diff 60% / contexts 40%)

9. prompt.build({ diff', contexts', lang, hint?, customSuffix })
   → { system, user }

10. llmClient.chat({ system, user, model }, { timeoutMs })
   → message: string
   ├─ 失敗時 fatal (exit 3)

11. UI ループ: renderPreview → 選択
    ├ "採用してコミット"        → git.commit(message) → exit 0
    ├ "編集してからコミット"    → clack.text(initialValue=message) → git.commit(edited) → exit 0
    ├ "再生成 (追加指示)"       → clack.text(hint) → 8 へ戻る（hint を prompt に合流）
    └ "中止"                    → exit 0

12. --dry-run の場合: 11 の commit を行わず stdout へ出力して exit 0
```

### 4.2 予算配分ルール（`truncate.ts`）

総枠 `maxTokens`（`cl100k_base` 基準、実効上限は安全マージン 0.85 適用後）を `diff : contexts = 60 : 40` で分割。

- **diff**: 予算超過時は**末尾から**切り詰める（ファイルヘッダ `diff --git` を必ず残す）。ヘッダ各々の `diff --git ...` 〜 次のヘッダ直前までを「ブロック」とし、末尾ブロックから落とす。ブロック内で切る場合もトークン単位で末尾から切り詰める。
- **contexts**: 予算超過時は `content` のトークン数が長い順に落とす（ファイル単位で削除、部分切り詰めはしない）。
- **エッジケース**: `effectiveBudget(maxTokens)` が 0 以下の場合は `diff` も `contexts` も空となり、早期 exit または空の結果を返す。
- **カスタムプロンプト**: `customSuffix` は `maxTokens` とは独立した専用予算 `PROMPT_SUFFIX_MAX_TOKENS = 1000` を持ち、超過時は末尾から切り詰められる。

---

## 5. 設定・CLI

### 5.1 環境変数

| 変数名                          | デフォルト                  | 説明                                                      |
| ------------------------------- | --------------------------- | --------------------------------------------------------- |
| `NEXUS_API_URL`                 | `http://localhost:8080`     | Nexus サーバーのベース URL。明示指定時は自動起動しない。  |
| `NEXUS_AUTO_START`              | `0`                         | `1` の場合、対話モードで Nexus daemon を自動起動する（opt-in） |
| `NEXUS_BIN`                     | （自動解決）                | Nexus 実行ファイルの明示パス。未指定時は自動解決する。    |
| `NEXUS_LOG_FILE`                | （未設定）                  | 自動起動した daemon の stdout/stderr 追記先ファイルパス   |
| `NEXUS_COMMIT_LLM_URL`          | `http://localhost:11434/v1` | OpenAI 互換エンドポイントのベース URL                     |
| `NEXUS_COMMIT_LLM_MODEL`        | `qwen2.5-coder:1.5b`          | 使用モデル名                                              |
| `NEXUS_COMMIT_LLM_API_KEY`      | `ollama`                    | OpenAI 互換のための形式上のキー                           |
| `NEXUS_COMMIT_LANG`             | `ja`                        | 生成言語（`ja` / `en`）                                   |
| `NEXUS_COMMIT_MAX_TOKENS`       | `8192`                      | diff + context の合計トークン数上限（`cl100k_base` 基準） |
| `NEXUS_COMMIT_NEXUS_TIMEOUT_MS` | `5000`                      | Nexus API タイムアウト                                    |
| `NEXUS_COMMIT_LLM_TIMEOUT_MS`   | `60000`                     | LLM タイムアウト                                          |

※ `NEXUS_COMMIT_MAX_CHARS` は廃止。使用した場合は警告が表示され、`NEXUS_COMMIT_MAX_TOKENS` へ移行を促す。

### 5.2 CLI フラグ

| フラグ                   | 挙動                                         |
| ------------------------ | -------------------------------------------- |
| `--staged`（デフォルト） | `git diff --staged` を対象                   |
| `--unstaged`             | unstaged の diff を対象                      |
| `--all`                  | staged + unstaged の和集合                   |
| `--auto-start-nexus`     | 対話モードで Nexus daemon を自動起動する     |
| `--lang <ja\|en>`        | `NEXUS_COMMIT_LANG` を上書き                 |
| `--model <name>`         | モデル名を上書き                             |
| `--dry-run`              | コミット実行せずメッセージを stdout          |
| `--no-context`           | Nexus 問い合わせをスキップ（強制オフライン） |
| `--doctor`               | 診断モードを実行して終了                     |
| `-h` / `--help`          | ヘルプ                                       |
| `-v` / `--version`       | バージョン                                   |

### 5.3 優先順位

`CLI フラグ > 環境変数 > デフォルト`。`config.ts` の `loadConfig(env, flags)` を純粋関数として実装し、単体テスト可能にする。

### 5.4 カスタムプロンプト

リポジトリ直下の `.github/nxc.prompt.md` を読み込み、`system` プロンプトの末尾に「# プロジェクト固有ルール」として連結する。

- ファイル不在時・I/O エラー時はサイレントまたは警告ログを出し、デフォルトのプロンプトで続行する。
- 連結されるテキストの上限は `PROMPT_SUFFIX_MAX_TOKENS = 1000` トークンとし、超過する場合は末尾がトークン単位で切り詰められる。

---

## 6. 外部インターフェース

### 6.1 Nexus サーバー API（クライアント側コントラクト）

- **エンドポイント**: `POST {NEXUS_API_URL}/api/search`
- **レスポンス検証**: Zod Schema `NexusSearchResponseSchema` による検証。
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
    "results": [{ "file": "src/foo.ts", "content": "関連コンテキスト本文" }]
  }
  ```
- **タイムアウト**: 5 秒（既定、可変）
- **失敗時**: 接続不可・5xx・4xx・タイムアウトのいずれも「警告 + contexts=[]」で続行


### 6.2 Nexus daemon 自動起動

`--auto-start-nexus` または `NEXUS_AUTO_START=1` が指定された場合、`nxc` は Nexus サーバーが未起動なら daemon として自動起動する。

- **opt-in**: 既定では自動起動しない。
- **対話モード限定**: `--non-interactive` または `CI=true` の環境では自動起動しない。
- **ポート自動管理**: 空きポートを OS に問い合わせて採番し、`<repo>/.nexus/nxc-daemon.json` に `{ port, pid, startedAt }` を記録する。次回実行時はこのファイルを読み取って既存 daemon を再利用する。
- **NEXUS_API_URL 明示時は無効**: ユーザーが明示的に URL を指定している場合、自動起動は行わない。
- **失敗時フォールバック**: 起動に失敗しても既存の `NEXUS_API_URL` への接続を試み、それも失敗すれば従来通り contexts=[] で続行する。
- **Node.js 24+ が必要**: Nexus daemon の起動には Node.js 24 以上が必要。満たさない場合は警告を出してフォールバックする。
- **ログ**: 既定では子プロセスの stdio は無視する。`NEXUS_LOG_FILE` を設定すると stdout/stderr を追記する。
- **停止**: `nxc` は daemon を停止しない。手動停止する場合は `.nexus/nxc-daemon.json` の `pid` を `kill` する。

### 6.2 ローカル LLM API（OpenAI 互換）

- **エンドポイント**: `POST {NEXUS_COMMIT_LLM_URL}/chat/completions` および `GET {NEXUS_COMMIT_LLM_URL}/models`
- **レスポンス検証**: Zod Schema `ChatCompletionResponseSchema` および `ModelListResponseSchema` による検証。
- **リクエスト**:
  ```json
  {
    "model": "qwen2.5-coder:7b",
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user", "content": "..." }
    ],
    "stream": false,
    "temperature": 0.2
  }
  ```
- **ヘッダ**: `Authorization: Bearer {llmApiKey}`
- **レスポンス**: OpenAI 互換（`choices[0].message.content` を使用）
- **タイムアウト**: 60 秒（既定、可変）
- **失敗時**: fatal（exit 3）。stderr にエラー概要を出力。Zod によるパースエラーも含む。

---

## 7. プロンプト設計

### 7.1 system プロンプト（`ja` 例）

```text
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

````text
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

| 発生箇所             | 異常                                | 方針                                   | exit |
| -------------------- | ----------------------------------- | -------------------------------------- | ---- |
| `bin/nxc.ts`         | `doctor` 診断フェーズの失敗         | 全チェック実施後、レポート出力して終了 | 4    |
| `git.isRepo`         | 非 git ディレクトリ                 | fatal、明快な案内                      | 2    |
| `git.getDiff`        | diff が空                           | 正常終了（"変更がありません"）         | 0    |
| `git.commit`         | pre-commit フック失敗等             | stderr 表示、中断                      | 1    |
| `nexusClient.search` | 接続不可 / 5xx / 4xx / タイムアウト | 警告のみ、contexts=[] で続行           | -    |
| `nexusClient.search` | Zod 型検証エラー                    | 警告のみ、contexts=[] で続行           | -    |
| `llmClient.chat`     | 接続不可 / タイムアウト             | fatal、"ローカル LLM に接続できません" | 3    |
| `llmClient.chat`     | 5xx / 不正レスポンス / Zod 検証失敗 | fatal、レスポンス概要出力              | 3    |
| Ctrl+C               | `@clack/prompts.isCancel`           | クリーン終了、commit しない            | 0    |
| 設定値不正           | 未サポート lang 等                  | 起動時バリデーションで fatal           | 2    |
| `tokenizer.getEncoder`| 同期失敗（理論上ないが念のため） | `Buffer.byteLength(text, 'utf8')` を用いたバイト数でフォールバック | - |

### 8.2 タイムアウト実装パターン

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const res = await fetch(url, { signal: controller.signal /* ... */ });
  // ...
} finally {
  clearTimeout(timer);
}
```

### 8.3 Nexus フォールバック時 UX

```text
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

| 階層         | 対象                                                    | アプローチ                      | 目標カバレッジ |
| ------------ | ------------------------------------------------------- | ------------------------------- | -------------- |
| 単体（純粋） | `keywords`/`truncate`/`prompt`/`config`/`flags`/`schemas`/`tokenizer` | 入出力検証                      | 95%+           |
| 単体（I/O）  | `nexus-client` / `llm` / `prompt-file`                  | `vi.stubGlobal('fetch')` / `fs` | 主要分岐       |
| 単体（git）  | `git`                                                   | `vi.mock('node:child_process')` | 主要コマンド   |
| 連携（純粋） | `doctor`                                                | I/O モックを利用した動作確認    | 主要分岐       |
| 対話（将来） | 対話フロー                                              | MVP 外。将来 `execa` 等で E2E   | —              |

### 9.2 重要テストケース（抜粋）

**`keywords.extract(diff)`**

- 追加行からのみ識別子を抽出（削除行 `-` は無視）
- diff ヘッダ（`+++ b/path`）行から識別子を拾わない
- 頻度順にソート、TypeScript 予約語（`const` / `function` 等）を除外
- 上限 N 件で打ち切り

**`truncate.build({ diff, contexts, maxTokens })`**

- 合計が `maxTokens`（安全マージン適用後）以内なら無変更
- 超過時 diff 予算内に収まるよう末尾ブロックから削除（`diff --git` ヘッダは残す）
- contexts 超過時はトークン数が長い順に完全削除
- 空配列・`maxTokens=0` のエッジケース

**`prompt.build({ diff, contexts, lang, hint?, customSuffix? })`**

- `lang` に応じて言語指示が切り替わる
- Conventional Commits の型一覧を system に含む
- contexts 空のときセクション自体を省略
- hint 指定時に user prompt 末尾へ追記
- customSuffix 存在時、system 末尾にプロジェクト固有ルールとして追記

**`loadConfig(env, flags)`**

- フラグが env を上書き
- 未指定時はデフォルト
- 不正 `lang` / `maxTokens` で throw
- `--no-context` → `useContext: false`
- `NEXUS_COMMIT_MAX_CHARS` 設定時警告

**`nexus-client.search(...)`**

- 正常レスポンスを `NexusResult[]` に整形
- 5xx / 4xx / タイムアウトを throw（呼び出し側が catch しフォールバック）
- レスポンス JSON 不正 (Zod Error) でも throw

**`llm.chat(...)`**

- `choices[0].message.content` を返す
- `choices` 空で throw
- 401 / 500 / タイムアウトで throw

### 9.3 ファイル配置

```text
tests/
├── keywords.test.ts
├── truncate.test.ts
├── prompt.test.ts
├── prompt-file.test.ts
├── config.test.ts
├── flags.test.ts
├── nexus-client.test.ts
├── llm.test.ts
├── schemas.test.ts
├── tokenizer.test.ts
├── doctor.test.ts
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

```text
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
│   ├── prompt-file.ts             # 新規
│   ├── tokenizer.ts               # 新規
│   ├── schemas.ts                 # 新規
│   ├── doctor.ts                  # 新規
│   ├── logger.ts
│   └── types.ts
├── tests/
│   ├── ...                        # 各ファイルに対応したテスト群
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
- dependencies: `@clack/prompts`, `picocolors`, `zod`, `js-tiktoken`
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
  - **Linux 専用**: macOS / Windows では `--network=host` がホストネットワークに繋がらないため、代わりに Nexus / Ollama の URL を `http://host.docker.internal:<port>` に設定して使用すること（`NEXUS_API_URL` / `NEXUS_COMMIT_LLM_URL` 環境変数で上書き可能）

---

## 11. リスクと緩和策

| リスク                                              | 影響                     | 緩和策                                                                                            |
| --------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| Nexus API 仕様が将来変わる                          | コンテキスト取得崩壊     | `nexus-client.ts` に閉じ込め、失敗時は警告のみで続行                                              |
| モデルがプロンプト指示を守らず説明文を混入          | コミットメッセージ不正   | `temperature=0.2`、system で「メッセージ以外出力禁止」を明記、受領後に簡易バリデーション          |
| 巨大 diff でモデル崩壊                              | 無意味な出力             | `truncate.ts` のトークン予算配分で防御。`maxTokens` は env で調整可能                             |
| `child_process` 経由の git 実行で引数エスケープミス | コマンドインジェクション | `spawn` / `execFile` を使用し、シェル経由実行（`exec`）を避ける。ユーザー入力を引数として渡さない |
| Ctrl+C 中に commit が走る                           | 意図しないコミット       | `isCancel` 判定をメインループ全段で実施、commit 直前にも再確認                                    |
| tree-sitter 等への将来拡張                          | 設計ロックイン           | `keywords.ts` は純粋関数・単一エクスポート `extract(diff): string[]` で差し替え容易               |
| `cl100k_base` で SentencePiece 系モデルのトークン数超過 | コンテキスト超過         | 安全マージン（`0.85`）を設定し、常に余裕を持たせる                                                |

---

## 12. 将来拡張（非スコープ、参考）

- 設定ファイル（`~/.nxcrc` / `.nxcrc` / `nxc.config.ts`）による一元的な設定管理のサポート
- **Nexus Global Manager への対応**: 単一エンドポイント（常駐サーバー）で複数リポジトリのコンテキストを切り替えて検索できる仕組みへの最適化
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
8. `--doctor` フラグで API の状態・モデルの存在確認ができる
9. `.github/nxc.prompt.md` がある場合、カスタムルールが適用される