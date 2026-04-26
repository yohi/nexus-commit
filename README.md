# 🧠 Nexus Commit (`nxc`)

**Zero External Data Transmission. Deeply Contextual AI Commits.**

Nexus Commit (`@yohi/nexus-commit`) は、ローカルインデックス・検索基盤「[Nexus](https://github.com/yohi/nexus)」の能力をフル活用し、コード変更の背景を深く理解したコミットメッセージを完全ローカルで自動生成する次世代のCLIアシスタントです。

外部のSaaS型AIツールに未公開のソースコードを送信するセキュリティリスクを完全に排除しつつ、エンタープライズ水準の知的支援と極上の開発者体験（DX）を提供します。

## ✨ Core Features

- 🔒 **完全ローカル完結 (Privacy First)**
  Ollama等のローカルLLMエコシステムと統合。ソースコードやGitの差分データが外部ネットワークに送信されることは一切ありません。
- 🧠 **Nexusによる圧倒的な文脈理解 (Deep Context)**
  単なる `git diff` の要約ではありません。裏側でローカルのNexusサーバーに通信し、「変更された関数の定義」や「影響を受ける依存ファイル」などの周辺コンテキストを動的に取得してLLMに提供します。
- ⚡ **シームレスな開発者体験 (Human-in-the-Loop)**
  ターミナルで `nxc` と叩くだけ。直感的な対話型UIで、AIが生成したメッセージのプレビュー、微調整、再生成、そしてコミットまでが流れるように完結します。
- 📝 **Conventional Commits 完全準拠**
  チームの開発規約に合わせた、美しく統一されたコミット履歴（`feat:`, `fix:`, `refactor:` 等）を自動で構築します。多言語（日本語・英語）出力にも対応。

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

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXUS_API_URL` | Nexus API base URL | `http://localhost:8080` |
| `NEXUS_COMMIT_LLM_URL` | LLM API endpoint | `http://localhost:11434/v1` |
| `NEXUS_COMMIT_LLM_MODEL` | Model name | `qwen2.5-coder:7b` |
| `NEXUS_COMMIT_LLM_API_KEY` | API key for LLM | `ollama` |
| `NEXUS_COMMIT_LANG` | Output language (`ja` or `en`) | `ja` |
| `NEXUS_COMMIT_MAX_CHARS` | Max characters for prompt | `24000` |
| `NEXUS_COMMIT_NEXUS_TIMEOUT_MS` | Nexus timeout (ms) | `5000` |
| `NEXUS_COMMIT_LLM_TIMEOUT_MS` | LLM timeout (ms) | `60000` |

### DevContainer

Open `.devcontainer/` with VS Code → "Reopen in Container".

On macOS/Windows, set the following instead of relying on `--network=host`:

```bash
export NEXUS_API_URL=http://host.docker.internal:8080
export NEXUS_COMMIT_LLM_URL=http://host.docker.internal:11434/v1
```

Verify connectivity to services:

```bash
# Check Nexus connectivity
curl -I $NEXUS_API_URL

# Check LLM connectivity (Ollama example)
curl $NEXUS_COMMIT_LLM_URL/models
```

### CLI Options

```bash
nxc [options]

Options:
  --staged       Target staged diff (default)
  --unstaged     Target unstaged diff
  --all          Target both staged + unstaged
  --lang <ja|en> Output language (default: ja)
  --model <name> Override LLM model name
  --dry-run      Print message to stdout without committing
  --no-context   Skip Nexus context lookup
  -h, --help     Show help
  -v, --version  Show version
```

## Development

```bash
# Install dependencies
npm ci

# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run typecheck

# Build
npm run build

# Run in development mode
npm run dev
```

## Manual verification results for acceptance criteria 1–7

設計書（§13）に定義された受け入れ基準に基づく検証結果です。

- **Acceptance 1 (§13.1): DevContainer 開発環境の起動**
  - Verification viewpoint: 独立したリポジトリとして DevContainer で開発が開始できるか。
  - Verification steps: `.devcontainer` を開き、`npm ci` および `npm run build` が成功することを確認。
  - Result: PASS (`npm ci` & `npm run build` success)
- **Acceptance 2 (§13.2): コミットメッセージ生成**
  - Verification viewpoint: staged な変更がある状態でメッセージが生成されるか。
  - Verification steps: `git add` 後に `npm run dev -- --staged` を実行。
  - Result: PASS (Conventional Commits 形式のメッセージが生成された)
- **Acceptance 3 (§13.3): Nexus フォールバック**
  - Verification viewpoint: Nexus サーバー停止時に警告が出て続行できるか。
  - Verification steps: Nexus 未起動状態で `nxc` を実行。
  - Result: PASS (警告「Nexus サーバーに接続できませんでした」が表示され、生成が継続された)
- **Acceptance 4 (§13.4): Dry-run モード**
  - Verification viewpoint: `--dry-run` 指定時にコミットが実行されないか。
  - Verification steps: `nxc --dry-run` を実行し、メッセージ出力後に `git log` に変化がないことを確認。
  - Result: PASS (stdout への出力のみ行われ、コミットは作成されなかった)
- **Acceptance 5 (§13.5): 言語切り替え**
  - Verification viewpoint: `--lang en` 指定時に英語で生成されるか。
  - Verification steps: `nxc --lang en` を実行。
  - Result: PASS (英語のメッセージが生成された)
- **Acceptance 6 (§13.6): 自動検証スクリプト**
  - Verification viewpoint: 全てのテスト、型チェック、リンターが成功するか。
  - Verification steps: `npm run test`, `npm run typecheck`, `npm run lint` を実行。
  - Result: PASS (全てのコマンドが正常終了した)
- **Acceptance 7 (§13.7): キャンセル安全性**
  - Verification viewpoint: Ctrl+C 中断時にコミットが走らないか。
  - Verification steps: プロンプト待機中に Ctrl+C で終了。
  - Result: PASS (即座に終了し、コミットは実行されなかった)
