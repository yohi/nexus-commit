# 🧠 Nexus Commit (`nxc`)

**外部へのデータ送信一切なし。深い文脈を理解するAIコミットアシスタント。**

Nexus Commit (`@yohi/nexus-commit`) は、ローカルインデックス・検索基盤「[Nexus](https://github.com/yohi/nexus)」の能力をフル活用し、コード変更の背景を深く理解したコミットメッセージを完全ローカルで自動生成する次世代のCLIアシスタントです。

外部のSaaS型AIツールに未公開のソースコードを送信するセキュリティリスクを完全に排除しつつ、エンタープライズ水準の知的支援と極上の開発者体験（DX）を提供します。

## ✨ 主な特徴

- 🔒 **完全ローカル完結 (プライバシー優先)**
  Ollama等のローカルLLMエコシステムと統合。ソースコードやGitの差分データが外部ネットワークに送信されることは一切ありません。
- 🧠 **Nexusによる圧倒的な文脈理解 (ディープ・コンテキスト)**
  単なる `git diff` の要約ではありません。裏側でローカルのNexusサーバーに通信し、「変更された関数の定義」や「影響を受ける依存ファイル」などの周辺コンテキストを動的に取得してLLMに提供します。
- ⚡ **シームレスな開発者体験 (Human-in-the-Loop)**
  ターミナルで `nxc` と叩くだけ。直感的な対話型UIで、AIが生成したメッセージのプレビュー、微調整、再生成、そしてコミットまでが流れるように完結します。
- 📝 **Conventional Commits 完全準拠**
  チームの開発規約に合わせた、美しく統一されたコミット履歴（`feat:`, `fix:`, `refactor:` 等）を自動で構築します。多言語（日本語・英語）出力にも対応。

## 使い方

### 前提条件

- Node.js 22+
- OpenAI互換のローカルLLMエンドポイント (Ollama / LM Studio / vLLM 等)
- (任意) `NEXUS_API_URL` で指定された Nexus 検索サーバー (デフォルト: `http://localhost:8080`)

### ソースコードからのインストールと実行

```bash
npm ci
npm run build
node dist/bin/nxc.js --help
```

### 環境変数

| 変数名 | 説明 | デフォルト値 |
|----------|-------------|---------|
| `NEXUS_API_URL` | Nexus API のベースURL | `http://localhost:8080` |
| `NEXUS_COMMIT_LLM_URL` | LLM API のエンドポイント | `http://localhost:11434/v1` |
| `NEXUS_COMMIT_LLM_MODEL` | 使用するモデル名 | `qwen2.5-coder:7b` |
| `NEXUS_COMMIT_LLM_API_KEY` | LLM API キー | `ollama` |
| `NEXUS_COMMIT_LANG` | 出力言語 (`ja` または `en`) | `ja` |
| `NEXUS_COMMIT_MAX_CHARS` | プロンプトの最大文字数 | `24000` |
| `NEXUS_COMMIT_NEXUS_TIMEOUT_MS` | Nexus 通信のタイムアウト (ms) | `5000` |
| `NEXUS_COMMIT_LLM_TIMEOUT_MS` | LLM 通信のタイムアウト (ms) | `60000` |

### DevContainer

VS Code で `.devcontainer/` を開き、「コンテナで再度開く (Reopen in Container)」を選択してください。

macOS/Windows の場合、`--network=host` に頼る代わりに以下のように設定してください：

```bash
export NEXUS_API_URL=http://host.docker.internal:8080
export NEXUS_COMMIT_LLM_URL=http://host.docker.internal:11434/v1
```

サービスへの接続確認：

```bash
# Nexus への接続確認
curl -I $NEXUS_API_URL

# LLM への接続確認 (Ollama の例)
curl $NEXUS_COMMIT_LLM_URL/models
```

### CLI オプション

<!-- CLI_OPTIONS_START -->
```bash
Usage: nxc [options]

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
```
<!-- CLI_OPTIONS_END -->

## 仕様

詳細な仕様やアーキテクチャについては、[SPEC.md](./SPEC.md) を参照してください。

## 開発

```bash
# 依存関係のインストール
npm ci

# テストの実行
npm test

# リンターの実行
npm run lint

# 型チェック
npm run typecheck

# ビルド
npm run build

# 開発モードで実行
npm run dev
```