# 🧠 Nexus Commit (`nxc`)

**外部へのデータ送信一切なし。深い文脈を理解するAIコミットアシスタント。**

Nexus Commit (`@yohi/nexus-commit`) は、ローカルインデックス・検索基盤「[Nexus](https://github.com/yohi/nexus)」の能力をフル活用し、コード変更の背景を深く理解したコミットメッセージを完全ローカルで自動生成する次世代のCLIアシスタントです。

外部のSaaS型AIツールに未公開のソースコードを送信するセキュリティリスクを完全に排除しつつ、エンタープライズ水準の知的支援と極上の開発者体験（DX）を提供します。

---

## 🙋 FOR HUMANS (人間向けガイド)

### ✨ 主な特徴

- 🔒 **完全ローカル完結 (プライバシー優先)**: Ollama等のローカルLLMエコシステムと統合。
- 🧠 **Nexusによる圧倒的な文脈理解**: 単なる `git diff` ではなく、周辺コードの意図を汲み取ります。
- ⚡ **シームレスな開発者体験**: ターミナルで `nxc` と叩くだけ。Human-in-the-Loop で再生成も自在。
- 📝 **Conventional Commits 完全準拠**: 美しく統一されたコミット履歴を自動で構築。

### 🚀 実際の利用フロー

```text
$ npx @yohi/nexus-commit
┌  nxc — Nexus Commit
│
◒  LLM でコミットメッセージ生成中...
◇  生成完了
│
◇  生成されたコミットメッセージ ────────────────────────────╮
│                                             │
│  feat(auth): SessionManager のインターフェース変更に対応  │
│                                             │
├─────────────────────────────────────────────╯
│
◆  どうしますか？
│  ● 採用してコミット
│  ○ 編集してからコミット
│  ○ 再生成（追加指示）
│  ○ 中止
└
```

### 🧠 Nexus が実現する「ディープ・コンテキスト」

```mermaid
graph LR
    A[git diff] --> B(nxc)
    C[Local Index: Nexus] -- 関連コードの文脈 --> B
    B --> D{Local LLM}
    D -- 高精度なメッセージ --> B
    B -- ユーザー承認 --> E[git commit]
```

### 🛠 使い方 (人間向け)

#### 前提条件
- Node.js 22+
- ローカルLLMエンドポイント (Ollama 等)
  - 推奨モデル: `qwen2.5-coder:1.5b` (軽量・高速) または `qwen2.5-coder:3b`
- (任意) Nexus 検索サーバー

#### セットアップ・実行方法
- **npx からの直接実行 (推奨)**: `npx @yohi/nexus-commit`
- **npm からのインストール**: `npm install -g @yohi/nexus-commit --registry=https://npm.pkg.github.com`
- **動作確認 (診断モード)**: セットアップ後、以下のコマンドで LLM や Nexus との接続を確認できます。
  ```bash
  npx @yohi/nexus-commit --doctor
  ```
- **AI エージェントによる自動セットアップ**:
  Claude Code や Gemini CLI などのエージェントに以下のプロンプトを渡すだけで、システム全体またはプロジェクト単位での環境構築を自動化できます。

  ```text
  https://raw.githubusercontent.com/yohi/nexus-commit/master/README.md を読み込み、nexus-commit のセットアップを行って。LLMやNexusサーバーの情報をユーザーに確認し（そのプロジェクト用かどうかも含む）、`--doctor` での疎通確認、システム設定（~/.zshrc等への書き込み）かプロジェクト設定（.env）かの選択を含めて、ステップバイステップで実行して。
  ```
- **ソースコードから**: `npm ci && npm run build && node dist/bin/nxc.js`

---

<details>
<summary>🤖 FOR AGENTS (AIエージェント向け指示)</summary>

あなたがターミナル操作可能な AI エージェントであるなら、以下の手順に従ってプロジェクトのセットアップや利用を行ってください。

### 1. 指示書の読み込み (MANDATORY)
作業を開始する前に、必ず以下の URL から最新の指示書（`AGENTS.md`）を読み込み、そこに記載されたルールに即座に従ってください：
> https://raw.githubusercontent.com/yohi/nexus-commit/master/AGENTS.md

### 2. プロジェクトのセットアップ (Prompt)
新しいプロジェクトに `nexus-commit` を導入する際、またはマシン全体のグローバル設定を行いたい場合は、以下のプロンプトを使用してください：

```text
https://raw.githubusercontent.com/yohi/nexus-commit/master/README.md を読み込み、nexus-commit を使うためのセットアップを行って。

作業にあたっては、以下のステップを遵守して：
1. ユーザーに対して、利用しているローカルLLMのエンドポイントURLやモデル名、NexusサーバーのURL（そのプロジェクト用に起動されているもの）などの必要情報をツール（ask_user等）で確認して。
2. 確認した情報で、実際に LLM や Nexus サーバーと通信できるか `--doctor` フラグ等を使用して確認して。
3. 確認した内容を「システム全体（シェルプロファイル）」と「このプロジェクトのみ（.env）」のどちらに適用するかユーザーに確認して。
4. システム全体の場合は ~/.zshrc や ~/.bashrc に export 文を追記し、プロジェクトのみの場合は .env を作成して。
5. プロジェクトの構成を分析し、最適なコミットルールを定義した .github/nxc.prompt.md を作成して。
```


### 3. コミットメッセージの生成 (Prompt)
変更内容に基づいたコミットを行う際は、以下のプロンプトを使用してください：

```text
npx @yohi/nexus-commit を使って、変更内容に基づいた Conventional Commits 準拠のコミットメッセージを生成し、コミットして
```

</details>

---

## ⚙️ 詳細設定

### 環境変数

本ツールは、環境変数を多層的に解決することで、柔軟な設定管理を実現しています。

#### 設定の優先順位 (Cascading)
下に行くほど優先度が高くなります（後の設定が前を上書きします）。
1. **デフォルト値** (コード内に定義)
2. **システム設定 / グローバル環境変数** (`~/.bashrc` や OS の環境変数)
3. **プロジェクト固有設定** (リポジトリルートの `.env` ファイル)
4. **CLI フラグ** (実行時の `--model` 等)

#### 環境変数詳細
すべての設定は環境変数経由で行うことができ、プロジェクトごとに `.env` で最適化することが可能です。

| 変数名 | デフォルト値 | 説明 |
| :--- | :--- | :--- |
| `NEXUS_API_URL` | `http://localhost:8080` | **Nexus サーバーのベースURL**<br>ローカルインデックス検索を行う Nexus サーバーの場所を指定します。 |
| `NEXUS_COMMIT_LLM_URL` | `http://localhost:11434/v1` | **LLM API のエンドポイント**<br>OpenAI 互換プロトコルを使用します。Ollama の場合は通常 `http://localhost:11434/v1` となります。**注意：`/api/generate` ではなく `/v1` を指定してください。** |
| `NEXUS_COMMIT_LLM_MODEL` | `qwen2.5-coder:1.5b` | **使用する LLM モデル名**<br>ローカルにプル済みのモデル名を指定します。軽量・高速な `1.5b` クラスを推奨します。 |
| `NEXUS_COMMIT_LLM_API_KEY` | `ollama` | **LLM API キー**<br>ローカル LLM の場合は任意の文字列で構いません。 |
| `NEXUS_COMMIT_LANG` | `ja` | **出力言語**<br>`ja` (日本語) または `en` (英語) を指定できます。 |
| `NEXUS_COMMIT_MAX_TOKENS` | `8192` | **最大トークン数**<br>プロンプト（diff + コンテキスト）の合計上限。 js-tiktoken (cl100k_base) で計算されます。 |
| `NEXUS_COMMIT_NEXUS_TIMEOUT_MS` | `5000` | **Nexus 通信のタイムアウト**<br>ミリ秒単位。Nexus が重い場合やネットワーク越しの場合に調整してください。 |
| `NEXUS_COMMIT_LLM_TIMEOUT_MS` | `60000` | **LLM 生成のタイムアウト**<br>ミリ秒単位。巨大な diff や低速なマシンでの生成時に調整してください。 |


### カスタムプロンプト (オプション)
`.github/nxc.prompt.md` を配置することで、プロジェクト固有のルールを追加できます。

### CLI オプション
`nxc --help` で詳細なオプションを確認できます。主要なオプションは以下の通りです：

| フラグ | 説明 |
| :--- | :--- |
| `--staged` | ステージングされた変更を対象にする（デフォルト） |
| `--unstaged` | 未ステージングの変更を対象にする |
| `--all` | ステージング・未ステージングの両方を対象にする |
| `--dry-run` | コミットを実行せず、メッセージを出力する |
| `--non-interactive` | 対話的な確認をスキップして即座に実行する |
| `--doctor` | 診断モードを実行して接続状況を確認する |
| `--no-context` | Nexus サーバーへの問い合わせをスキップする |

### スクリプト連携
`--non-interactive` と `--dry-run` を組み合わせることで、コミットメッセージのみをクリーンに出力できます。他の CLI ツールや CI/CD パイプラインでの利用に便利です。

```bash
# メッセージのみを変数に格納
msg=$(nxc --dry-run --non-interactive --no-context)
echo "Generated: $msg"
```

## 📖 その他
- [SPEC.md](./SPEC.md): 詳細な仕様・アーキテクチャ
- [CHANGELOG.md](./CHANGELOG.md): 更新履歴
- [LICENSE](./LICENSE): MIT License
