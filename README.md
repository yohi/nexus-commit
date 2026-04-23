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
