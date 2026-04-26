# nxc Phase 1-4 機能拡張 設計書

- **作成日**: 2026-04-26
- **対象リポジトリ**: `nexus-commit`
- **パッケージ名**: `@yohi/nexus-commit`
- **CLI コマンド**: `nxc`
- **対象バージョン**: 0.1.0 → 0.2.0 (Phase 3 の破壊的変更により minor bump)
- **ステータス**: 設計レビュー待ち
- **関連仕様**: [SPEC.md](../../../SPEC.md)
- **AGENTS 指示**: [AGENTS.md](../../../AGENTS.md)

---

## 1. 目的とスコープ

### 1.1 目的

`nexus-commit` (`nxc`) CLI に対し、以下 4 つの段階的改善を加える。各 Phase は独立してリリース可能。

| Phase | 概要 | 区分 |
|---|---|---|
| 1 | zod による外部 API レスポンスの厳格な型検証 | Quick Win |
| 2 | `--doctor` 診断モード追加 | Quick Win |
| 3 | 文字数ベースから **トークンベース**の切り詰めへ移行 | Next Level |
| 4 | `.github/nxc.prompt.md` によるプロジェクト固有プロンプトの外部化 | Next Level |

### 1.2 非スコープ

- `--prompt-file <path>` フラグでの任意パス指定（将来検討）
- カスタムプロンプトの replace / target=user モード（将来検討）
- Llama/Qwen 等 SentencePiece 系専用トークナイザの統合（将来検討）
- `--doctor --json` の JSON 出力（将来検討）
- 既存 [SPEC.md §1.3](../../../SPEC.md) の非スコープ事項をすべて継承

---

## 2. 意思決定の記録 (ADR)

### 2.1 トークナイザ: `js-tiktoken` + `cl100k_base` 固定 + 安全マージン

**採用案**: `js-tiktoken` をインストールし `cl100k_base` エンコーダのみを使用。実トークン数は安全マージン (`× 0.85`) を掛けて overflow を防ぐ。

- **採用理由**:
  - AGENTS.md `[CRITICAL] Minimize Workspace Bloat` に対し最小限の依存追加
  - モデル切り替え時にコード分岐不要（実装が簡素）
  - 安全マージンで非 OpenAI モデル（Qwen/Llama）の SentencePiece 系トークナイザ差分（経験則 ±10〜25%）を吸収可能
- **棄却案**:
  - `encodingForModel(model)` 動的選択 — OpenAI 系は正確だが非 OpenAI モデルでは誤差が残るため複雑化のメリットが薄い
  - `gpt-tokenizer` / `Math.ceil(chars / 3.5)` ヒューリスティック — メンテ実績や精度で `js-tiktoken` に劣る
  - HuggingFace tokenizer 動的取得 — 重量級で AGENTS.md 制約に違反

### 2.2 zod スキーマ集約: `src/schemas.ts` 単一ファイル

**採用案**: 全 zod スキーマを新規 `src/schemas.ts` に集約。各 I/O クライアントは import して使用。

- **採用理由**:
  - スキーマの再利用性（`--doctor` の listModels も同モジュールを参照）
  - 1:1 のテストファイル `tests/schemas.test.ts` で網羅可能
- **棄却案**: 各クライアント内に co-locate — 重複・分散の温床

### 2.3 LLM レスポンス検証: `.passthrough()` 採用

**採用案**: 必須フィールドのみ厳格検証、未定義フィールドは許容。

- **採用理由**: OpenAI 互換 API は `refusal` / `tool_calls` 等のフィールドを将来追加する可能性が高い。`.strict()` だと将来的に互換性が壊れる
- **棄却案**: `.strict()` — 過剰な厳密性で運用負荷を生む

### 2.4 カスタムプロンプト: append-only 方式

**採用案**: `.github/nxc.prompt.md` の内容を system プロンプト末尾に「# プロジェクト固有ルール」セクションとして連結する。frontmatter なし、replace モードなし。

- **採用理由**:
  - Conventional Commits の type 一覧等のコアルールの事故的破壊を防ぐ
  - 主要ユースケース（JIRA プレフィクス等の **追加** 要件）に append で十分対応
  - 実装最小・テスト容易
- **棄却案**:
  - YAML frontmatter で mode/target 制御 — 過剰な設計
  - `# REPLACE` H1 見出しによる置換規約 — 学習コストに見合わない

### 2.5 `--doctor` モデル存在確認: OpenAI 互換 `GET /v1/models` のみ

**採用案**: モデル一覧取得は OpenAI 互換 `GET {llmUrl}/models` のみを使用。Ollama 固有の `/api/tags` は使わない。

- **採用理由**: AGENTS.md `[CRITICAL] Standardize AI SDKs` (OpenAI 互換限定) と整合
- **棄却案**: `/api/tags` 併用 — Ollama 固有依存を I/O 層に持ち込む

### 2.6 `Config` 型の破壊的変更: `maxChars` → `maxTokens`

**採用案**: `Config.maxChars` を削除し `Config.maxTokens` を追加。環境変数も `NEXUS_COMMIT_MAX_CHARS` → `NEXUS_COMMIT_MAX_TOKENS` へ rename。version を 0.1.0 → 0.2.0 に bump。

- **採用理由**:
  - 0.x.y は SemVer で破壊的変更が許容される段階
  - 後方互換用エイリアスを残すと設定値の解釈がブレて混乱を招く
- **棄却案**: 旧名併存 — 二重メンテのコスト

---

## 3. アーキテクチャ

### 3.1 モジュール構成（変更後）

```text
src/
├── bin/
│   └── nxc.ts            ☆改修: --doctor 早期分岐 / customSuffix 注入
├── doctor.ts             ★新規: 診断コーディネータ (Phase 2)
├── schemas.ts            ★新規: zod スキーマ集約 (Phase 1)
├── tokenizer.ts          ★新規: cl100k_base ラッパ・トークン計測 (Phase 3)
├── prompt-file.ts        ★新規: .github/nxc.prompt.md 読み込み (Phase 4)
├── nexus-client.ts       ☆改修: parseResults を zod 化 (Phase 1)
├── llm.ts                ☆改修: extractContent を zod 化 + listModels 追加 (Phase 1, 2)
├── truncate.ts           ☆改修: build を token-aware 化 (Phase 3)
├── prompt.ts             ☆改修: customSuffix 引数追加 (Phase 4)
├── config.ts             ☆改修: maxTokens 解決 (Phase 3)
├── flags.ts              ☆改修: --doctor フラグ追加 (Phase 2)
├── git.ts                －変更なし
├── keywords.ts           －変更なし
├── logger.ts             －変更なし
└── types.ts              ☆改修: Config 型拡張 / LlmClientPort.listModels 追加
```

### 3.2 レイヤ責務（既存方針を維持）

| レイヤ | モジュール | 副作用 |
|---|---|---|
| エントリ | `bin/nxc.ts` | あり（プロセス制御） |
| コーディネータ | `doctor.ts` | あり（複数 I/O 呼び出し） |
| I/O ポート | `git.ts`, `nexus-client.ts`, `llm.ts`, `prompt-file.ts` | あり |
| 純粋ロジック | `schemas.ts`, `tokenizer.ts`, `keywords.ts`, `truncate.ts`, `prompt.ts`, `config.ts`, `flags.ts` | なし |
| ユーティリティ | `logger.ts`, `types.ts` | logger は副作用あり |

### 3.3 設計原則

1. **`tokenizer.ts` は副作用なし**: `getEncoding('cl100k_base')` の結果はモジュール内でメモ化し、`truncate.ts` から見ると純粋関数として振る舞う
2. **`prompt-file.ts` は I/O 層に閉じ込め**: `prompt.ts` 自体の純粋性は維持。`bin/nxc.ts` が読み込み済みのテキストを `prompt.build()` に渡す
3. **`Config` 型は破壊的変更**: `maxChars` を削除し `maxTokens` に置換 (v0.2.0)
4. **`customSuffix` は `Config` に含めない**: I/O から得る動的データであり、`Config` は env+flags の純粋写像であるべき原則を維持

### 3.4 依存追加

```bash
npm install zod js-tiktoken
```

予想バンドル増分: zod (~12KB gzip) + js-tiktoken (cl100k_base 辞書込み ~1.5MB unzipped)。AGENTS.md `[CRITICAL] Minimize Workspace Bloat` に対しては「ユーザー指示による明示承認」として整合。

---

## 4. Phase 1: zod による型検証

### 4.1 新規モジュール `src/schemas.ts`

```typescript
import { z } from 'zod';

/** Nexus API: POST /api/search レスポンス */
export const NexusResultItemSchema = z.object({
  file: z.string(),
  content: z.string(),
});

export const NexusSearchResponseSchema = z.object({
  results: z.array(NexusResultItemSchema),
});

/** OpenAI 互換: POST /v1/chat/completions レスポンス */
export const ChatCompletionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({ content: z.string() })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1, 'choices must contain at least one item'),
  })
  .passthrough();

/** OpenAI 互換: GET /v1/models レスポンス (Phase 2) */
export const ModelListResponseSchema = z
  .object({
    data: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .passthrough();

/** safeParse 失敗時のエラーメッセージ整形 */
export function formatZodError(prefix: string, err: z.ZodError): Error {
  const first = err.issues[0];
  const path = first.path.length > 0 ? ` at ${first.path.join('.')}` : '';
  return new Error(`${prefix}${path}: ${first.message}`);
}
```

### 4.2 `nexus-client.ts` 改修

```typescript
import { NexusSearchResponseSchema, formatZodError } from './schemas.js';

function parseResults(data: unknown): NexusResult[] {
  const parsed = NexusSearchResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw formatZodError('Invalid Nexus response', parsed.error);
  }
  return parsed.data.results;
}
```

### 4.3 `llm.ts` 改修

```typescript
import { ChatCompletionResponseSchema, formatZodError } from './schemas.js';

function extractContent(data: unknown): string {
  const parsed = ChatCompletionResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw formatZodError('Invalid LLM response', parsed.error);
  }
  return parsed.data.choices[0].message.content;
}
```

入力バリデーション (`timeoutMs` / `temperature`) は **既存の手書きを維持**（レスポンスとは別 concern）。

### 4.4 既存テストの更新

| 旧メッセージ | 新メッセージ（zod 由来） |
|---|---|
| `Invalid Nexus response: missing or non-array "results"` | `Invalid Nexus response at results: Expected array, received undefined` |
| `Invalid LLM response: choices missing` | `Invalid LLM response at choices: Required` |
| `LLM returned empty choices` | `Invalid LLM response at choices: choices must contain at least one item` |

`tests/nexus-client.test.ts` および `tests/llm.test.ts` のメッセージ期待値を更新する。

---

## 5. Phase 2: `--doctor` 診断モード

### 5.1 新規モジュール `src/doctor.ts`

```typescript
import type { Config, NexusClientPort, LlmClientPort } from './types.js';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail?: string;
  readonly hint?: string;
}

export interface DoctorDeps {
  readonly nexus: NexusClientPort;
  readonly llm: LlmClientPort;
  readonly cwd?: string;
}

export interface DoctorReport {
  readonly results: readonly CheckResult[];
  readonly exitCode: 0 | 4;
}

export async function runDoctor(
  config: Config,
  deps: DoctorDeps,
): Promise<DoctorReport>;

export function renderReport(report: DoctorReport): string;
```

### 5.2 `LlmClientPort` 拡張

```typescript
export interface LlmClientPort {
  chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string>;
  listModels(opts: { timeoutMs: number }): Promise<string[]>; // ★ 新規
}
```

`listModels` は `GET {llmUrl}/models` を叩き `ModelListResponseSchema` で検証して `data[].id` を返す。

### 5.3 チェック項目（実行順・各々独立に評価）

| # | チェック | 成功条件 | 失敗時のヒント例 |
|---|---|---|---|
| 1 | Node.js バージョン | `process.versions.node` の major >= 22 | `Node.js 22+ required, found vX. Use nvm to install.` |
| 2 | 設定値スナップショット | 常に `ok` | API キーは `***` で伏字表示 |
| 3 | Nexus API 疎通 | `useContext=true` で `POST /api/search` 200 (空クエリ) | `Nexus API not reachable at {url}. Is the server running?` / `useContext=false` 時は `skip` |
| 4 | LLM エンドポイント疎通 | `GET {llmUrl}/models` 200 | `LLM endpoint not reachable. Ensure Ollama is running on port {port}.` |
| 5 | モデル存在確認 | 4 が成功し `data[].id` に `config.llmModel` を含む | `Model '{model}' not found. Available: foo, bar, ... Run: ollama pull {model}` |
| 6 | カスタムプロンプト検出 | `.github/nxc.prompt.md` の存在確認 | `Custom prompt: skipped (no .github/nxc.prompt.md)` |

**4 が `listModels` 未対応で失敗した場合、5 は `skip` 表示**。

### 5.4 出力例

```text
nxc doctor

  ✓ Node.js version          v22.10.0
  ✓ Configuration            llmUrl=http://localhost:11434/v1, model=qwen2.5-coder:7b, lang=ja, maxTokens=8192, apiKey=***
  ✓ Nexus API reachable      http://localhost:8080  (responded in 42ms)
  ✓ LLM endpoint reachable   http://localhost:11434/v1
  ✗ Model 'qwen2.5-coder:7b' not found
       Available models: llama3.2:3b, codellama:7b
       Hint: Run `ollama pull qwen2.5-coder:7b`
  ⊘ Custom prompt file       skipped (no .github/nxc.prompt.md)

Result: 1 failed, 4 ok, 1 skipped (total 6)
Exit: 4
```

### 5.5 `flags.ts` 改修

```typescript
export interface Flags {
  /* ... 既存 ... */
  doctor: boolean;
}

case '--doctor':
  flags.doctor = true;
  break;
```

### 5.6 `bin/nxc.ts` 改修

`flags.help` / `flags.version` 直後・git チェック前に追加:

```typescript
if (flags.doctor) {
  const { runDoctor, renderReport } = await import('../doctor.js');
  const report = await runDoctor(config, {
    nexus: deps.nexus,
    llm: deps.llm,
  });
  process.stdout.write(renderReport(report));
  return report.exitCode;
}
```

`await import()` で動的ロードし、通常実行時のスタートアップコストを増やさない。

### 5.7 タイムアウト方針

各疎通チェックは専用の短いタイムアウト (`Math.min(config.nexusTimeoutMs, 3000)` など) を使い、1 チェックの遅延が全体を引きずらないようにする。**どのチェックが失敗しても後続チェックを継続する**（`fail-fast` しない）。

---

## 6. Phase 3: トークンベース切り詰め

### 6.1 新規モジュール `src/tokenizer.ts`

```typescript
import { getEncoding, type Tiktoken } from 'js-tiktoken';

let encoderCache: Tiktoken | null = null;

/** lazy 初期化された cl100k_base エンコーダを返す。
 *  cl100k_base は OpenAI 系 GPT-3.5/4 の BPE。Llama/Qwen 等の SentencePiece 系
 *  モデルに対しては近似値（経験則として ±10〜25% の誤差）。
 *  本ツールでは安全マージンを掛けて overflow を防ぐ前提で使用する。 */
function getEncoder(): Tiktoken {
  if (encoderCache === null) {
    encoderCache = getEncoding('cl100k_base');
  }
  return encoderCache;
}

export function countTokens(text: string): number {
  if (text.length === 0) return 0;
  return getEncoder().encode(text).length;
}

export function truncateToTokens(text: string, budget: number): string {
  if (budget <= 0) return '';
  const tokens = getEncoder().encode(text);
  if (tokens.length <= budget) return text;
  return getEncoder().decode(tokens.slice(0, budget));
}

export const TOKEN_SAFETY_MARGIN = 0.85;

export function effectiveBudget(maxTokens: number): number {
  return Math.floor(maxTokens * TOKEN_SAFETY_MARGIN);
}
```

### 6.2 `truncate.ts` 改修

```typescript
import { countTokens, truncateToTokens, effectiveBudget } from './tokenizer.js';

export interface TruncateInput {
  diff: string;
  contexts: NexusResult[];
  maxTokens: number; // ★ 旧 maxChars
}

export function build({ diff, contexts, maxTokens }: TruncateInput): TruncateOutput {
  const budget = effectiveBudget(maxTokens);
  const diffBudget = Math.floor(budget * 0.6);
  const contextBudget = budget - diffBudget;

  return {
    diff: truncateDiffByTokens(diff, diffBudget),
    contexts: truncateContextsByTokens(contexts, contextBudget),
  };
}
```

#### `truncateDiffByTokens` のロジック

1. `diff --git ` ヘッダで blocks 配列に分割（既存ロジック流用）
2. 末尾 block から削除しつつ join 後の token 数が budget 以下になるまで縮める
3. それでも収まらなければ最終 block 内を末尾から token 単位で `truncateToTokens` で切る
4. 先頭の `diff --git ...` ヘッダ行は必ず保持

#### `truncateContextsByTokens` のロジック

content の **token 数** が長い順にファイル単位で削除（部分切り詰めはしない、既存方針を踏襲）。

### 6.3 `config.ts` 改修

| 環境変数 | 旧 | 新 |
|---|---|---|
| 名前 | `NEXUS_COMMIT_MAX_CHARS` | `NEXUS_COMMIT_MAX_TOKENS` |
| デフォルト | `24000` (chars) | `8192` (tokens) |
| 解釈 | 文字数上限 | トークン数上限（`cl100k_base` 基準）。実際の使用量は `× 0.85` の安全マージン適用後の値が上限となる |

```typescript
export interface Config {
  /* ... */
  maxTokens: number; // ★ 旧 maxChars
}

const maxTokens = parsePositiveInt(env.NEXUS_COMMIT_MAX_TOKENS, 8192, 'maxTokens');
```

### 6.4 エッジケース

| ケース | 挙動 |
|---|---|
| `maxTokens = 0` | `Invalid maxTokens: 0` で `loadConfig` が throw（既存 `parsePositiveInt` 流用） |
| diff が単一巨大行（改行なし） | `diff --git` ヘッダのみ保持後、token 単位で末尾切り詰め |
| `getEncoding` が失敗 | `Math.ceil(text.length / 4)` の文字数推定値を返すフォールバック |
| context の content が ANSI 制御文字を含む | `prompt.ts` 側の既存 ANSI 除去で対応（`truncate` 段階では生のまま扱う） |

### 6.5 README/SPEC 更新

- `README.md` の環境変数表で `NEXUS_COMMIT_MAX_CHARS` → `NEXUS_COMMIT_MAX_TOKENS` に変更
- [SPEC.md §5.1](../../../SPEC.md) の表を更新
- [SPEC.md §4.2](../../../SPEC.md) の予算配分ルールを「文字数」→「トークン数」に書き換え

---

## 7. Phase 4: プロンプト外部化

### 7.1 仕様サマリ

| 項目 | 内容 |
|---|---|
| ファイルパス | `<git-root>/.github/nxc.prompt.md` のみ |
| オーバーライド方式 | append-only |
| ファイル不在時 | サイレントに無視（既存挙動維持） |
| 読み込みタイミング | 起動時 1 回（再生成ループでは再読込しない） |

### 7.2 新規モジュール `src/prompt-file.ts`

```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export interface PromptFileLookupResult {
  readonly path: string | null;
  readonly content: string | null;
}

export async function loadPromptFile(
  cwd: string = process.cwd(),
): Promise<PromptFileLookupResult> {
  const root = await findGitRoot(cwd);
  if (root === null) return { path: null, content: null };

  const candidate = join(root, '.github', 'nxc.prompt.md');
  try {
    const content = await readFile(candidate, 'utf8');
    return { path: candidate, content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path: candidate, content: null };
    }
    throw err;
  }
}

export async function findPromptFile(
  cwd: string = process.cwd(),
): Promise<string | null> {
  const result = await loadPromptFile(cwd);
  return result.content !== null ? result.path : null;
}
```

### 7.3 `prompt.ts` 改修

```typescript
export interface PromptInput {
  diff: string;
  contexts: NexusResult[];
  files: string[];
  lang: Lang;
  hint?: string;
  customSuffix?: string; // ★ 追加
}

function buildSystem(lang: Lang, customSuffix?: string): string {
  const base = [/* ... 既存 ... */].join('\n');

  if (customSuffix === undefined || customSuffix.trim().length === 0) {
    return base;
  }
  return [
    base,
    '',
    '# プロジェクト固有ルール',
    customSuffix.trim(),
  ].join('\n');
}
```

`prompt.ts` は **引数経由でテキストを受け取るだけの純粋関数のまま**。

### 7.4 `bin/nxc.ts` 改修

`main()` 内の `loadConfig` 直後・git チェックより前に追加:

```typescript
let customSuffix: string | undefined;
try {
  const { content } = await loadPromptFile();
  customSuffix = content ?? undefined;
} catch (err) {
  logger.warn(`カスタムプロンプトファイルの読み込みに失敗: ${errorToString(err)}`);
  logger.warn('   デフォルトプロンプトで続行します。');
}
```

`generate()` シグネチャに `customSuffix` を渡し、`buildPrompt({ ..., customSuffix })` に流す。

### 7.5 `Config` への影響

**追加なし**。`customSuffix` は I/O から得られる動的データであり、`Config` 型に含めない。

### 7.6 サンプル `.github/nxc.prompt.md`

```markdown
## JIRA 連携ルール
- ブランチ名が `JIRA-XXX-...` の場合、コミットメッセージ末尾に `Refs: JIRA-XXX` を付与する
- description は 50 文字以内
- 本文では「なぜ変更が必要か」を 1 行で説明する

## チーム規約
- scope は `auth`, `payment`, `ui`, `infra` のいずれかから選ぶ
```

ユーザー記述内容はそのまま `# プロジェクト固有ルール` セクションとして system プロンプト末尾に連結される。Conventional Commits の type 一覧等のコアルールは破壊されない。

---

## 8. エラー処理

### 8.1 エラー分類（変更点のみ・既存は [SPEC.md §8.1](../../../SPEC.md) を踏襲）

| 発生箇所 | 異常 | 方針 | exit |
|---|---|---|---|
| `--doctor` 実行 | いずれかのチェック失敗 | 全チェック実施後、レポート表示 | **4 (新規)** |
| `loadPromptFile` | `ENOENT` | サイレント無視 | - |
| `loadPromptFile` | パーミッション/I/O エラー | warning ログ、デフォルトプロンプトで続行 | - |
| `LlmClient.listModels` | 接続不可・5xx・タイムアウト | `--doctor` 内で fail として記録、continue | (4) |
| `tokenizer.getEncoder` | 同期失敗（理論上ないが念のため） | `Math.ceil(text.length / 4)` でフォールバック | - |
| zod バリデーション失敗 | `formatZodError` で既存 Error 形式に整形 | 既存挙動踏襲（throw） | 3 (LLM) / - (Nexus 警告のみ) |

### 8.2 既存 exit code は不変

`0` (正常) / `1` (commit 失敗等) / `2` (設定/環境エラー) / `3` (LLM fatal) は変更なし。新規は **`4` (`--doctor` 失敗)** のみ。

---

## 9. テスト戦略

### 9.1 テスト全体マトリクス

| ファイル | 種別 | 新規 / 改修 | 主要ケース |
|---|---|---|---|
| `tests/schemas.test.ts` | 純粋 | 新規 | 各 zod スキーマの正常 / 異常 / passthrough |
| `tests/tokenizer.test.ts` | 純粋 | 新規 | `countTokens` / `truncateToTokens` / マージン / フォールバック |
| `tests/prompt-file.test.ts` | I/O モック | 新規 | git外/ENOENT/成功/読込エラー |
| `tests/doctor.test.ts` | コーディネータ | 新規 | 各チェック分岐 / exit code / 出力 |
| `tests/nexus-client.test.ts` | I/O モック | 改修 | エラーメッセージ更新 |
| `tests/llm.test.ts` | I/O モック | 改修 | `listModels` 追加・エラーメッセージ更新 |
| `tests/truncate.test.ts` | 純粋 | 改修 | token ベースに置換 |
| `tests/prompt.test.ts` | 純粋 | 改修 | `customSuffix` の append 動作追加 |
| `tests/config.test.ts` | 純粋 | 改修 | `maxTokens` / `NEXUS_COMMIT_MAX_TOKENS` |
| `tests/flags.test.ts` | 純粋 | 改修 | `--doctor` パース |
| `tests/bin/nxc.test.ts` | 統合 | 改修 | `--doctor` 早期分岐・`customSuffix` 注入 |
| `tests/keywords.test.ts` | 純粋 | 変更なし | - |
| `tests/git.test.ts` | I/O モック | 変更なし | - |
| `tests/logger.test.ts` | スモーク | 変更なし | - |

### 9.2 検証コマンド（Devcontainer 内で実行・AGENTS.md `[REQUIRED]`）

```bash
npm ci
npm install zod js-tiktoken
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build

node dist/bin/nxc.js --doctor
```

---

## 10. リリース戦略 (Phase 別 PR 分割)

| PR | Phase | 含まれる変更 | テスト |
|---|---|---|---|
| **#A** | Phase 1 | `schemas.ts` 新規 / `nexus-client.ts` `llm.ts` 改修 / 関連テスト更新 | zod スキーマテスト追加 |
| **#B** | Phase 2 | `doctor.ts` 新規 / `flags.ts` 改修 / `llm.listModels` 追加 / `bin/nxc.ts` 早期分岐 | `doctor.test.ts` 追加 |
| **#C** | Phase 3 | `tokenizer.ts` 新規 / `truncate.ts` 改修 / `config.ts` の `maxTokens` 化 / README/SPEC 環境変数表更新 / `package.json` v0.2.0 bump | token ベース truncate テスト |
| **#D** | Phase 4 | `prompt-file.ts` 新規 / `prompt.ts` `customSuffix` / `bin/nxc.ts` 注入 / `doctor` チェック#6 統合 / README に外部化手順追記 | `prompt-file.test.ts` 追加 |

各 PR は **独立してマージ可能**。Phase 1 → 2 → 3 → 4 の順序を推奨（Phase 2 は Phase 1 の zod スキーマを使うため）。

---

## 11. リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| `cl100k_base` で Qwen の token 数を過小評価し overflow | LLM が応答崩壊 | `TOKEN_SAFETY_MARGIN=0.85` で常に 15% マージン確保 |
| zod 導入で既存テストのメッセージ期待値変更が広範に | レビュー負荷増 | `formatZodError` のフォーマットを統一し、PR 説明文に変更点を明記 |
| `--doctor` の `listModels` が一部 OpenAI 互換実装で未対応 | 診断 4 番目で常に fail | チェック#5 を「listModels が成功した場合のみ実施」とし、未対応なら `skip` 表示 |
| `prompt-file` 読み込みで予期せぬ I/O ブロック | 起動遅延 | `loadPromptFile` は `await` だが小さいファイル想定。タイムアウト不要 |
| js-tiktoken のバンドルサイズ増 (~1.5MB) | npm install 時間増 | 既知のトレードオフ。AGENTS.md `[CRITICAL]` 制約はユーザー指示で承認済み扱い |
| `maxChars` → `maxTokens` 破壊的変更でユーザーの env 設定が壊れる | 起動エラー | リリースノート明記。`loadConfig` で `NEXUS_COMMIT_MAX_CHARS` を検出した場合は警告ログ出力（実装コスト低い場合） |

---

## 12. 受け入れ基準

[SPEC.md §13](../../../SPEC.md) の既存基準 1〜7 に加え:

8. `nxc --doctor` が git リポジトリ外でも動作し、Nexus / LLM の疎通とモデル存在を診断する
9. Nexus / LLM のいずれかが応答不能なとき `nxc --doctor` が exit 4 を返す
10. `.github/nxc.prompt.md` を配置すると system プロンプト末尾にその内容が append される
11. `NEXUS_COMMIT_MAX_TOKENS` で指定した値（× 0.85）以下のトークン数に diff+context が収まる
12. zod 検証失敗時の Error メッセージが `Invalid {Nexus|LLM} response at <path>: <message>` 形式で発火する
13. `npm test` / `npm run typecheck` / `npm run lint` / `npm run format:check` がすべて成功する（**Devcontainer 内で実行**）

---

## 13. 将来拡張（参考）

- `--prompt-file <path>` フラグでの任意パス指定
- カスタムプロンプトの replace モード（YAML frontmatter 制御）
- Llama/Qwen 専用の正確なトークナイザ統合（Hugging Face 等）
- `--doctor --json` の JSON 出力
- `nxc init` サブコマンドで `.github/nxc.prompt.md` テンプレート生成
- 既存 [SPEC.md §12](../../../SPEC.md) の将来拡張をすべて継承
