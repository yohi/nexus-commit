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
