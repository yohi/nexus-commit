# Changelog

## [1.2.0](https://github.com/yohi/nexus-commit/compare/v1.1.0...v1.2.0) (2026-05-05)


### Features

* **doctor:** --json フラグを追加し、診断結果の JSON 出力をサポート ([0d98069](https://github.com/yohi/nexus-commit/commit/0d98069c0c514380ea2449b2e633cd29380ecabd))
* **doctor:** 診断結果の Configuration 詳細に nexusUrl を追加 ([264d6f7](https://github.com/yohi/nexus-commit/commit/264d6f754ad19d8c8b11c4352758264187c54093))
* **nxc:** CLI機能強化と開発ガイドライン更新 ([49c871d](https://github.com/yohi/nexus-commit/commit/49c871d3fb31cd6a3b29d8572e0c977240fdc5da))


### Bug Fixes

* **bin:** LLMの出力からマークダウンコードブロックを削除 ([6a82a65](https://github.com/yohi/nexus-commit/commit/6a82a65732eafa85e70717d9e8bae6f297992419))

## [1.1.0](https://github.com/yohi/nexus-commit/compare/v1.0.0...v1.1.0) (2026-05-04)


### Features

* **config:** LLMモデル設定の追加と、トークン予算再分配ロジックのテスト強化 ([6285b54](https://github.com/yohi/nexus-commit/commit/6285b542757cacb1346141b53c9c6af6be1ee4e5))
* **docs:** README を人間向けに改訂し、利用フローを具体化 ([3093417](https://github.com/yohi/nexus-commit/commit/3093417ee43b72fba1f6a79a76ae04cac4ec56d6))


### Bug Fixes

* **config:** デフォルトLLMモデルをqwen2.5-coder:1.5bに更新 ([a10c2a7](https://github.com/yohi/nexus-commit/commit/a10c2a73d79f61e1aa15080fb3bc9e63f30a613a))

## 1.0.0 (2026-05-03)


### ⚠ BREAKING CHANGES

* NEXUS_COMMIT_MAX_CHARS 廃止とトークン超過時の切り詰め改善
* **tokenizer:** トークン処理のエラーハンドリングと最小予算を改善
* **truncate:** NEXUS_COMMIT_MAX_CHARS (default 24000) を NEXUS_COMMIT_MAX_TOKENS (default 8192, cl100k_base 基準) に置換。実際の使用量は安全マージン 0.85 適用後の値が上限となる。

### Features

* --doctor フラグの実行経路を接続 ([037389d](https://github.com/yohi/nexus-commit/commit/037389dadadb1e5541113f35088c987d4443cb40))
* add flag parser with validation for --lang and unknown flags ([242e3cd](https://github.com/yohi/nexus-commit/commit/242e3cdda6ddf1f98f6b7d3920a09adbaedf3477))
* add flag parser with validation for --lang and unknown flags ([3dc68e7](https://github.com/yohi/nexus-commit/commit/3dc68e78cd2b376134de61a6b8530b26e9e1d7f6))
* add HttpNexusClient with AbortController timeout ([70bac18](https://github.com/yohi/nexus-commit/commit/70bac1824863730002e8cf02b5830796fb6e4880))
* add keyword extractor with frequency ranking and reserved word filter ([68bdd27](https://github.com/yohi/nexus-commit/commit/68bdd272ad2665b1956ce1be288cd1dae0b7a9be))
* add keyword extractor with frequency ranking and reserved word filter ([37f34a1](https://github.com/yohi/nexus-commit/commit/37f34a1d0519ce97babb94842a2af204ec389a05))
* add loadConfig with env/flags precedence and validation ([d8ec27b](https://github.com/yohi/nexus-commit/commit/d8ec27baf68439d9664718d255944afec8010c4c))
* add loadConfig with env/flags precedence and validation ([fad09f9](https://github.com/yohi/nexus-commit/commit/fad09f93a61fd0c5a61bc50bd6a5e705715fba4c))
* add NodeGitClient using child_process.execFile ([e2300d9](https://github.com/yohi/nexus-commit/commit/e2300d94c6cb7c676604d7a2bb77326d3a9295ff))
* add OpenAI-compatible LLM client with Bearer auth and timeout ([c25fb79](https://github.com/yohi/nexus-commit/commit/c25fb792b8b7dd4658a4e4c3585ef90d349b6d4d))
* add system/user prompt builder with ANSI stripping and CRLF normalization ([8bd5135](https://github.com/yohi/nexus-commit/commit/8bd5135a8ddc1305ed7c9f46eb4b481264ab6c1e))
* add system/user prompt builder with ANSI stripping and CRLF normalization ([9257e5f](https://github.com/yohi/nexus-commit/commit/9257e5ffb8a500ca39c73ec506b136a92b87a86e))
* add truncate with diff/context budget allocation (60/40) ([b557ef7](https://github.com/yohi/nexus-commit/commit/b557ef7b9ff4b7cc1cd0f21463b68a720d7887be))
* add truncate with diff/context budget allocation (60/40) ([7961a45](https://github.com/yohi/nexus-commit/commit/7961a45a1f2cbb9bcdcd3b283bf20520ceb4ff04))
* **bin/nxc:** --doctorフラグを追加 ([cf37f4a](https://github.com/yohi/nexus-commit/commit/cf37f4a63ba714a15bb5732473874172a18a645f))
* **cli:** add nxc entrypoint skeleton with --help, --version, flag parsing ([396887a](https://github.com/yohi/nexus-commit/commit/396887a03de1e61f8e92957870d119811ef6336e))
* **cli:** doctorモードの依存関係作成を共通化し、LLMチェックを強化 ([ecade7a](https://github.com/yohi/nexus-commit/commit/ecade7a997a9045839b5ac3a0e74ed9c5a2597bf))
* **cli:** dry-runモードのUI表示を改善 ([f89987d](https://github.com/yohi/nexus-commit/commit/f89987d56e32735b741e59d1d97b416030f5261e))
* **cli:** implement interactive flow with Clack, Nexus, and LLM integration ([bcd9002](https://github.com/yohi/nexus-commit/commit/bcd90021924907e225e5686bd6c75c1261e192d8))
* **docs:** AGENTS.md を追加し、README および SPEC を更新 ([b0b93ee](https://github.com/yohi/nexus-commit/commit/b0b93ee9a161fadda993b21ac359c2bcec556a51))
* **docs:** Nexus Commit 実装計画を追加 ([9906407](https://github.com/yohi/nexus-commit/commit/9906407b6cd5425118b698cb3acf3292161a55bc))
* **doctor:** .github/nxc.prompt.md の検出チェックを完成 ([aa20e21](https://github.com/yohi/nexus-commit/commit/aa20e214086358a6814202ecb222fd7f8a03bfac))
* **flags:** --doctor フラグを追加 ([0ed965a](https://github.com/yohi/nexus-commit/commit/0ed965a6af945ef0ca62731c9a918cf41417e929))
* **llm:** LlmClientPort.listModels を追加 ([6c4c7d6](https://github.com/yohi/nexus-commit/commit/6c4c7d60b0fd632953a32fd5198aaafc0f3ac209))
* **llm:** 温度設定オプションの追加とAPIリクエスト処理の改善 ([3a69180](https://github.com/yohi/nexus-commit/commit/3a691808070d4e1fcf87abf18d1baba6ed988b1e))
* **nxc:** カスタムプロンプトを起動時に読み込み system に注入 ([35ac50a](https://github.com/yohi/nexus-commit/commit/35ac50a38267a1c17360afedfdcbcbe46aab9292))
* **nxc:** カスタムプロンプト機能の追加とトークン制限設定の更新 ([47fefa5](https://github.com/yohi/nexus-commit/commit/47fefa5e808e9a7f8c07b3a617206e8f680924f4))
* **pkg:** GitHub Packages への公開と AI エージェント連携 ([9d93be7](https://github.com/yohi/nexus-commit/commit/9d93be76bc8b78769ee82437bfe411865755516a))
* **prompt-file:** .github/nxc.prompt.md の読み込みモジュールを追加 ([4d73c07](https://github.com/yohi/nexus-commit/commit/4d73c07480b56256cdbeaec8094ff640d082281a))
* **prompt:** customSuffix で system プロンプトに append 可能に ([3d77671](https://github.com/yohi/nexus-commit/commit/3d77671a106b28d84b541107f58a6f3d1e11a6e5))
* **prompt:** カスタムプロンプトの末尾をトークン上限で切り詰めて警告する ([80bfb28](https://github.com/yohi/nexus-commit/commit/80bfb286dc14166baef820820bcf2255b174040b))
* **schemas:** zod スキーマ集約モジュールを新規追加 ([ea457a0](https://github.com/yohi/nexus-commit/commit/ea457a0b2dbae4cbb9248e3b471a75aeda6a9251))
* **schemas:** zod スキーマ集約モジュールを新規追加 ([54812d9](https://github.com/yohi/nexus-commit/commit/54812d9b55cc1adcac82bea2a7477c6ea87746d7))
* **tokenizer:** cl100k_base ベースの token 計測ユーティリティを新規追加 ([908228f](https://github.com/yohi/nexus-commit/commit/908228f6f61c49a877793dd5ccbac9bd92f0aaa3))
* **tokenizer:** cl100k_base ベースの token 計測ユーティリティを新規追加 ([4584b39](https://github.com/yohi/nexus-commit/commit/4584b39ac17b41387c7a4cfafb35dd87a2bd07a9))
* **tokenizer:** cl100k_base 計測ユーティリティ ([4d28af7](https://github.com/yohi/nexus-commit/commit/4d28af7a15c5076fbecbf35b409713293db63a0d))
* **truncate:** maxChars を maxTokens に置換し token-aware に変更 ([e847275](https://github.com/yohi/nexus-commit/commit/e8472752e6ea3117d0b5d41539f56f68e5342663))
* ロガーと型定義の追加 ([0cd59fd](https://github.com/yohi/nexus-commit/commit/0cd59fd255b049075263db894c2f9dca5b3e0f90))
* 言語・モデルフラグの追加とコンテキスト切り捨て処理の改善 ([8c3fb75](https://github.com/yohi/nexus-commit/commit/8c3fb750bd1cbf8b0f714343f016eacdf996ac23))
* 診断モードのロジックを src/doctor.ts に実装 ([9e84e27](https://github.com/yohi/nexus-commit/commit/9e84e27df442c0a30b5d808fdef897b4bc1fcb40))


### Bug Fixes

* allow null content in ChatCompletionResponseSchema ([a5e2433](https://github.com/yohi/nexus-commit/commit/a5e2433a338ed65af9422d7bbbea7d0bde1b0582))
* **bin:** main関数で特定のエラーコードを保持 ([4d88171](https://github.com/yohi/nexus-commit/commit/4d88171de4ec45801ce94aa5a3c2df022cc399f7))
* **ci:** GitHub Packages へのパブリッシュ認証とリポジトリ連携を修正 ([f44d506](https://github.com/yohi/nexus-commit/commit/f44d50640543efc1c2f7045be92b34d9f0ef7e41))
* **config:** truncateの無限ループ防止とpromptの正規表現更新 ([4219e56](https://github.com/yohi/nexus-commit/commit/4219e56e55cc2e7610d82852ddf710878d35eb0c))
* **core:** LLM応答検証、エラーハンドリング、トークン処理を改善 ([92534fe](https://github.com/yohi/nexus-commit/commit/92534fe78a8894c1392a97fef916340d6f583149))
* **core:** 設定値パース、プロンプト、コンテキスト削減の堅牢化 ([b033c2f](https://github.com/yohi/nexus-commit/commit/b033c2f463dabb9750be43a25d9d508765343e44))
* **docs:** config.ts の純粋関数明示と --network=host の制限注記 ([7a5dd65](https://github.com/yohi/nexus-commit/commit/7a5dd65bf8729434f31f4456a2930b4bba6ef6b0))
* **docs:** MD040 対応と loadConfig 命名統一 ([b354b8e](https://github.com/yohi/nexus-commit/commit/b354b8e522b5cde6657b3d1c75c594b29b3ad431))
* **doctor:** doctorテストから不要な型を削除 ([1405048](https://github.com/yohi/nexus-commit/commit/140504892818cecc4b735b01b2d416aad108ce8b))
* **flags:** --lang のバリデーションを改善 ([cccdcac](https://github.com/yohi/nexus-commit/commit/cccdcacffcad75d99953f3d3cc4c3490cad3b068))
* flags: フラグの値が不足している場合のエラー処理を改善 ([3fb72d3](https://github.com/yohi/nexus-commit/commit/3fb72d381f1b5a6f634936c75a75bbb7144fb22d))
* **flags:** 競合する diff モードフラグの指定を拒否 ([497f350](https://github.com/yohi/nexus-commit/commit/497f350fe6537fddabb8f911974afe277657d21c))
* **git-client:** バッファサイズ増加と堅牢性向上 ([6e2c330](https://github.com/yohi/nexus-commit/commit/6e2c3304e6660ac75d564dc24c329a64197f5162))
* **git:** Gitクライアントの判定ロジックと空文字フィルタリングを修正 ([d002960](https://github.com/yohi/nexus-commit/commit/d002960d67c271d9ba2083f30269ddb2fd51e221))
* **llm:** JSONパースエラー時に詳細なエラー情報を表示 ([1cd53e5](https://github.com/yohi/nexus-commit/commit/1cd53e5f5f2f28eecdfa1927f9718227cf6abea2))
* **llm:** LLM APIレスポンスのエラーハンドリングを改善 ([566c62f](https://github.com/yohi/nexus-commit/commit/566c62f1298d1367b35785f0c1946c12fdda8100))
* **llm:** LLMクライアントにURLプロトコル検証を追加 ([da54a1f](https://github.com/yohi/nexus-commit/commit/da54a1f0b25c8587fbbb15f4c5d69a7e153bbf98))
* **llm:** LLMクライアントの型安全性を向上し、レスポンスハンドリングを改善 ([0b35536](https://github.com/yohi/nexus-commit/commit/0b355368e8de65f8c7025c0f857fb7d253eefb78))
* **llm:** SSRF対策としてメタデータIPへのアクセスをブロック ([1889100](https://github.com/yohi/nexus-commit/commit/1889100878bf5ed33798d40d12968d61e151647f))
* **llm:** タイムアウト検証とレスポンス解析の堅牢性を強化 ([ee02674](https://github.com/yohi/nexus-commit/commit/ee02674eac4e6a8e364eaac2e36c13585cf415cf))
* **llm:** 温度パラメータのバリデーションを追加 ([0bba013](https://github.com/yohi/nexus-commit/commit/0bba01315329037dda3a018176fd3aba6a393e2e))
* **nexus-client:** HttpNexusClientのエラーハンドリング、URL正規化、タイムアウト処理を改善 ([2a7e6c1](https://github.com/yohi/nexus-commit/commit/2a7e6c114039ded64081b1ad381e72c09aeb56f2))
* **nexus-client:** NexusClient: baseUrlの末尾スラッシュ正規化とAPIエラーハンドリングの改善 ([6c3fde5](https://github.com/yohi/nexus-commit/commit/6c3fde52828d34e3db324d32003ce4f2b597b354))
* **nexus:** Nexusクライアントのネットワークリクエストにおけるセキュリティとエラーハンドリングを強化 ([5aea599](https://github.com/yohi/nexus-commit/commit/5aea599124ddacee9595fab29642ab1151590bb1))
* **prompt-file:** テストのスキップ条件を修正 ([eeacc2a](https://github.com/yohi/nexus-commit/commit/eeacc2a713f1f62dc35e86cdff6a1a0f69ad9dcd))
* **prompt-file:** プロンプトファイルの読み込み効率化と空ファイル・OS依存パスの改善 ([c6cadea](https://github.com/yohi/nexus-commit/commit/c6cadea84b4116aa2b94eaf429e6f9932260c645))
* **prompt:** ANSIエスケープコードの正規表現を修正 ([ea1ae28](https://github.com/yohi/nexus-commit/commit/ea1ae28951180c6d82637ac347d6440c4362d8f4))
* resolve typecheck error and simplify eslint config ([1b34ebf](https://github.com/yohi/nexus-commit/commit/1b34ebf6194e647122b6647d0658b36a71dacde3))
* **safeJsonFetch:** エラー報告を詳細化 ([208e0cc](https://github.com/yohi/nexus-commit/commit/208e0cccd6d8284a53fb176e6ee4388ebeee9a75))
* satisfy TS typecheck and Codacy by using optional chaining with fallback ([141e47b](https://github.com/yohi/nexus-commit/commit/141e47bdd70c3cd05cef8d1ffe7523a30f8b0626))
* **schemas:** Zodエラーメッセージに全エラーパスを含めるように修正 ([bd2109f](https://github.com/yohi/nexus-commit/commit/bd2109fd7fba8099c35512b6a97a6e0fa5d5b2d5))
* **security:** Codacy指摘事項への対応（SSRF抑制の強化とコードスタイルの修正） ([ed911e9](https://github.com/yohi/nexus-commit/commit/ed911e90b2581e967a7fa759f98049db6e18b790))
* **security:** LLM および Nexus クライアントにおける SSRF 脆弱性を緩和 ([44925be](https://github.com/yohi/nexus-commit/commit/44925be50da23f6563149482428a7f390d876eaf))
* **security:** LLMおよびNexusクライアントのURL検証とエラーハンドリングを改善 ([f7bc041](https://github.com/yohi/nexus-commit/commit/f7bc041f9533a3a45a546e594271fcfd7626c1a6))
* **security:** safeFetch 関数におけるSAST対策を強化 ([4b78ccf](https://github.com/yohi/nexus-commit/commit/4b78ccfc30130c83e127cbceebc7486771babd97))
* **security:** safeJsonFetch でのレスポンスヘッダーアクセスとスニペット表示を修正 ([c380c6e](https://github.com/yohi/nexus-commit/commit/c380c6e67daa5a72bd160c77b39d8a3efceecfb2))
* **security:** SSRF 対策: URL 再構築による緩和 ([30267f4](https://github.com/yohi/nexus-commit/commit/30267f4eb8feadbd8442d239fd951bc8aef172cf))
* **security:** SSRFバイパスを防止するためにIPv6メタデータIPをブロック ([cc07a6d](https://github.com/yohi/nexus-commit/commit/cc07a6d5f4213f6c61e744af1148a038dc78f738))
* **security:** SSRF対策を強化するためのURL再構築ロジックを改善 ([1be822f](https://github.com/yohi/nexus-commit/commit/1be822f8878f2d0cf0d5e9d28d4a7d9fb68c023b))
* **security:** SSRF脆弱性対策のためURL検証を追加 ([eedcd20](https://github.com/yohi/nexus-commit/commit/eedcd207f5912170d6b0098913940bfdbe3d3906))
* **security:** ネットワークリクエストの安全性と信頼性を向上 ([007b334](https://github.com/yohi/nexus-commit/commit/007b334bf18ced9a4bcb27f0eeba77a3a58a36ab))
* **security:** 安全なURLフェッチ処理のSSRF対策を改善 ([228b657](https://github.com/yohi/nexus-commit/commit/228b65763b04afcc01b57d26f8568b1c98d6fef1))
* **tokenizer, schema:** トークナイザーのフォールバックとレスポンスcontentのNULL許容を修正 ([a59021a](https://github.com/yohi/nexus-commit/commit/a59021a2cfbeae8d1b4535e647b7f52e9f0685d0))
* **tokenizer:** diffヘッダーの誤った切り捨てを修正し、プロンプト関連定数をエクスポート ([9ae9a0e](https://github.com/yohi/nexus-commit/commit/9ae9a0e0189dafb43135d77d108b3c302d96f63e))
* **tokenizer:** トークナイザーのエラーハンドリングと予算計算を改善 ([0c85e66](https://github.com/yohi/nexus-commit/commit/0c85e6607d9d0d90197a833e5c8e876aceb7db75))
* **tokenizer:** トークン処理のエラーハンドリングと最小予算を改善 ([613d8ed](https://github.com/yohi/nexus-commit/commit/613d8ed52b164006995b1d1be0c207e8d75c68d0))
* **truncate:** コンテキストまたは差分が空の場合のトークン配分ロジックを修正 ([45f9701](https://github.com/yohi/nexus-commit/commit/45f9701c76fd127c8d4ea7710a848570ea6a72e6))
* **truncate:** トークンマップのundefinedアクセスによるエラーを回避 ([6fd5001](https://github.com/yohi/nexus-commit/commit/6fd500115736e6a13c1cbcf24ec5245935cc3e13))
* **truncate:** ヘッダーがトークン予算を超える場合に適切に切り詰める ([81b6230](https://github.com/yohi/nexus-commit/commit/81b6230e8ced56af5f7dbba473c9d130e8ba33cb))
* ネストされた code block を修正（4 backticks で外側を囲む） ([091a906](https://github.com/yohi/nexus-commit/commit/091a906c409b89cd2b46a7457db763c84cbeab7a))
* プロンプト正規表現の更新、トランケート処理の簡略化、テストモックの整理 ([9b6c845](https://github.com/yohi/nexus-commit/commit/9b6c845ca3b2df1852aa42b797512573f8c8064c))


### Performance Improvements

* further optimize diff truncation by removing redundant countTokens ([9b301ad](https://github.com/yohi/nexus-commit/commit/9b301adc40af81eb1fabc3c85d572d84e646e519))
* optimize context truncation complexity to O(M) ([4a2191b](https://github.com/yohi/nexus-commit/commit/4a2191bc1e5803f61524c210f751aaf24ce0ddf7))
* optimize diff truncation complexity to O(N) ([2e547d3](https://github.com/yohi/nexus-commit/commit/2e547d32b303c77e1aa752ec932e0dbf1a474b2b))


### Code Refactoring

* NEXUS_COMMIT_MAX_CHARS 廃止とトークン超過時の切り詰め改善 ([4e2a9e8](https://github.com/yohi/nexus-commit/commit/4e2a9e85efc535b41193ef1783ffbf25e7f8e349))
