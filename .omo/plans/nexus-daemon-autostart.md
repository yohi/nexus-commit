# 計画書: `nxc` による Nexus daemon 自動起動 & ポート自動マッピング

## 0. レビュー依頼の要点（Momus 向け）

本計画は「実現可能性の評価」を経てユーザーが方針承認した段階の**実装計画**です。
特に **第3章「核心的論点」** の設計判断（daemon 永続化とポート再発見の両立）について、
明確性・検証可能性・完全性・見落としの観点で厳しく評価してください。

---

## 1. 目的 / 承認済み方針

`npx @yohi/nexus-commit`（`nxc`）実行時、Nexus サーバーが起動していなければ
**自動的に daemon として起動**し、コミットコンテキスト検索に利用する。

ユーザー承認済みの前提:
- **初回起動時のインデックス構築に時間がかかるのは許容する。**
- **Nexus は daemon として nxc 終了後も生き続ける**こと（毎回起動・破棄しない）。
- **ポート番号は自動マッピングし、ユーザーが編集する設定ファイルには持たせたくない。**

非目標:
- 既存の graceful fallback（Nexus 不通時は警告して context なしで続行）は廃止しない。自動起動は**その手前の追加挙動**。
- Nexus 本体の機能追加は原則行わない（ただし第3章の選択肢Cで言及）。

---

## 2. 確定した事実（Nexus `src/bin/nexus.ts` / SPEC.md 実装ベース）

| # | 事実 | 出典 | 計画への影響 |
|---|---|---|---|
| F1 | `nexus --port <number>` で HTTP サーバ起動（MCP + REST API 同梱） | bin/nexus.ts help | 起動コマンド確定 |
| F2 | HTTP サーバは `127.0.0.1` に**ハードコード**でバインド | `server.listen(port, "127.0.0.1")` | localhost 限定で安全。SSRF 対策と非衝突 |
| F3 | `POST /api/search`(REST) と `POST /`(MCP) を公開 | bin/nexus.ts | nxc は `/api/search` を使用（現状通り） |
| F4 | **`--port 0` は拒否**（`port <= 0` で exit 1） | bin/nexus.ts | **親がポートを選んで渡す方式が唯一可能** |
| F5 | 起動ログ（`🚀 ... running on http://127.0.0.1:${port}`）は **stderr** 出力 | `console.error` | stdout パース不可。stderr 監視 or ポートプローブで ready 判定 |
| F6 | `server.listen()` 直後に `runtime.initialize()` を**バックグラウンド**実行 | bin/nexus.ts | ポートは即開くが初回は索引未完成。`index_status` で `isIndexing` 確認可 |
| F7 | プロセスロックは `storage.rootDir`(=`<repo>/.nexus`) 単位、二重起動は exit 1 | process-lock.ts / configuration.md | 同一 repo の多重 daemon は自動防止される |
| F8 | `--project-root <path>` / `NEXUS_PROJECT_ROOT` で索引対象指定（既定 cwd） | bin/nexus.ts | nxc は git root を明示的に渡すべき |
| F9 | Nexus は Node **>=24**、nexus-commit は Node **>=22** | 両 package.json | **Node バージョン不一致**。spawn 環境が 24 未満だと Nexus 起動失敗 |
| F10 | Nexus は Embedding に Ollama `nomic-embed-text`(既定 `http://127.0.0.1:11434`) を要求 | configuration.md | 別途前提。欠如時は DLQ に滞留 |
| F11 | 配布は GitHub Packages(`npm.pkg.github.com`)、bin 名 `nexus` / `@yohi/nexus` | nexus package.json | `npx @yohi/nexus` は認証必要 + ネイティブ依存重い |
| F12 | `.nexus/` は Nexus の既定 ignore 対象（git 管理外） | configuration.md | ランタイム状態ファイルの置き場所として最適 |

---

## 3. 核心的論点: daemon 永続化 と ポート再発見 の両立 ★最重要

### 問題
- daemon が nxc 終了後も生存する（F7・ユーザー要件）。
- しかし nxc を**次回起動**したとき、「前回起動した daemon が**どのポートで待っているか**」を知る手段が必要。
- ポートをエフェメラルに自動採番する（F4 により親が採番）と、その番号は**プロセス外に残さない限り次回わからない**。
- ユーザーは「設定ファイルに持ちたくない」。

### 用語の整理（提案）
「**ユーザー設定ファイル**（`.nxcrc` 等、人間が編集する）」と
「**ランタイム状態ファイル**（PID ファイル等、機械が自動管理し人間は触らない）」を区別する。
ユーザー要望は前者の否定であり、後者（自動管理・git 管理外）は要望と矛盾しないと解釈する。

### 選択肢

**選択肢A（推奨）: ランタイム状態ファイルで再発見**
- nxc が `<repo>/.nexus/nxc-daemon.json`（`{ port, pid }`、git ignore 済み F12）を読み書き。
- 発見フロー: 状態ファイル読む → `/api/search` health check → 生存なら再利用 / 死/不在なら新規 spawn + 状態書込。
- 長所: ポート自動採番と永続 daemon を両立。ユーザーは触らない。
- 短所: ランタイムファイルが1つ増える（PID ファイル類似なので許容範囲か？ → Momus 評価点）。

**選択肢B: リポジトリパス由来の決定論的ポート**
- `hash(repoRoot)` を 49152–65535（dynamic/private 帯）へ写像し固定ポート化。状態ファイル不要。
- 発見フロー: 算出ポートに health check → 不通なら spawn。
- 長所: 一切ファイルを持たない。多リポジトリでも衝突しにくい。
- 短所: ハッシュ衝突や他プロセスの占有時のフォールバックが必要。決定論ポートは「自動マッピング」と言えるが厳密には固定。

**選択肢C: Nexus 側がポートを既知ファイルへ自己記録（理想だが Nexus 改修）**
- Nexus が起動時に自分の HTTP ポートを `nexus.pid` 近傍へ書く。nxc はそれを読むだけ。
- 長所: nxc が採番ロジックを持たず最も堅牢。両 repo を同一オーナーが保守しているため現実的。
- 短所: Nexus 本体の変更が必要（本計画の非目標に抵触）。

### 確定（ユーザー承認 2026-06-10）
**選択肢A（ランタイム状態ファイル方式）を採用。** 状態ファイル `<repo>/.nexus/nxc-daemon.json` は「ユーザー設定」ではなく「PID ファイル相当のランタイム状態」と位置づける（git 管理外 F12）。
Momus レビュー [OKAY]。将来的に **選択肢C** へ移行すれば nxc 側ロジックを簡素化できる余地を残す。

---

## 4. 推奨アーキテクチャ（選択肢A 前提）

```
nxc 起動 (useContext=true かつ auto-start 有効時)
  1. git root 解決 (config.nexusUrl が明示指定なら自動起動せず従来動作)
  2. <repo>/.nexus/nxc-daemon.json を読む
       ├─ あり: port 取得 → POST /api/search に health check (短timeout)
       │         ├─ 生存 → そのポートで接続して終了(=利用)
       │         └─ 死亡 → 状態ファイル削除して 3 へ
       └─ なし: 3 へ
  3. 空きポート採番: net.createServer().listen(0) → address().port → close()
  4. nexus を detached spawn:
       spawn(nexusBin, ["--port", port, "--project-root", repoRoot],
             { detached: true, stdio: "ignore", env })
       child.unref()
  5. ready 待ち: /api/search を間隔ポーリング（最大 N 秒, 指数backoff）
  6. <repo>/.nexus/nxc-daemon.json に { port, pid } を書込
  7. そのポートで接続して通常フローへ
  ※ どの段階で失敗しても従来の graceful fallback（warn + context=[]）に落ちる
```

### nexus バイナリ解決順
1. 環境変数 `NEXUS_BIN`（明示指定）
2. ローカル `node_modules/.bin/nexus`
3. PATH 上の `nexus`（グローバルインストール）
4. `npx @yohi/nexus`（フォールバック。F11 の制約を warn）

### 有効化方法（確定: opt-in）
**opt-in を採用**（`--auto-start-nexus` フラグ または `NEXUS_AUTO_START=1`）。既定では自動起動しない。
`--doctor` と Nexus 不通時の fallback メッセージで機能の存在を告知する。
さらに **`--non-interactive` / CI 環境では opt-in 指定があっても自動起動を抑制**し、従来 fallback に落とす（U3 確定）。

---

## 5. 実装ステップ（TDD・各ステップ検証付き）

> アーキテクチャは I/O 層と純粋ロジック層を分離する既存方針（SPEC.md §3.3 DI）に従う。

1. **[検証] Nexus CLI 実挙動の確認**
   - 実際に `nexus --port <n> --project-root <tmp>` を起動し、`/api/search` 応答・stderr ログ・`.nexus/nexus.pid` 生成・SIGTERM 解放を確認。
   - 完了条件: 手動再現できる。

2. **純粋ロジック: 状態ファイル schema & パーサ** (`src/daemon-state.ts`)
   - `{ port:number, pid:number, startedAt:string }` の zod schema（`schemas.ts` に追加）。
   - read/parse/validate を純粋関数化。1:1 単体テスト。

3. **純粋ロジック: nexus バイナリ解決** (`src/nexus-spawn.ts` の解決部)
   - 解決順（§4）を純粋関数 + fs 存在チェックの薄い I/O に分離。テスト。

4. **I/O: 空きポート採番ユーティリティ** (`listen(0)` ラッパ)
   - 取得 → 即 close → 番号返却。競合(TOCTOU)リスクをコメント明記。

5. **I/O: daemon 起動 + ready 待ち** (`NexusDaemonManager`)
   - detached spawn / unref / ポーリング ready 判定 / タイムアウト。
   - `vi.mock('node:child_process')` + fetch stub で単体テスト。

6. **統合: bin/nxc.ts への配線**
   - `config.nexusUrl` 明示時は自動起動しない分岐。
   - 自動起動 → 解決した port を `HttpNexusClient` に渡す（in-memory、設定ファイル不要）。
   - 失敗時は既存 fallback に合流。

7. **`--doctor` 拡張**
   - Node>=24 チェック（F9）、`nexus` バイナリ解決可否、Ollama `nomic-embed-text` 存在（F10）、daemon 稼働/ポート表示。

8. **flags / config / README / SPEC 更新**
   - `--auto-start-nexus` or `NEXUS_AUTO_START`、`NEXUS_BIN` を追加。SPEC 非スコープ表記の見直し。

9. **検証コマンド一括**: `npm run typecheck && npm test && npm run lint && npm run format:check`

---

## 6. リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| Node<24 環境で spawn (F9) | Nexus 即時 exit、原因不明の不通 | spawn 前に node 版チェック、明快なエラー、fallback |
| 初回索引が長時間 (F6) | ブロック感 | ready=ポート開通で判定し**索引完了は待たない**。`isIndexing` を info 表示。検索は部分結果で続行 |
| Ollama/embed モデル欠如 (F10) | 索引が DLQ 滞留・結果空 | doctor で事前検出、warn |
| 空きポート採番後に第三者が奪取(TOCTOU) | spawn 失敗 | spawn 失敗時リトライ（別ポート再採番）→ 最終的に fallback |
| daemon の孤児化・無限増殖 | リソース浪費 | F7 ロックで同一 repo 多重起動防止。状態ファイル health check で再利用 |
| detached 子の stdio/ログ | デバッグ困難 | `stdio:"ignore"` 既定。`NEXUS_LOG_FILE` 指定時のみログ |
| `npx @yohi/nexus` 認証・重依存 (F11) | フォールバック失敗 | 解決順で最後。失敗時 warn し fallback |
| CI/非対話環境で勝手に daemon 起動 | 予期せぬ常駐 | **確定**: opt-in 必須 + `--non-interactive`/CI 時は opt-in でも自動起動を抑制 |

---

## 7. 決定事項（ユーザー承認 2026-06-10）

- U1【確定】有効化は **opt-in**（`--auto-start-nexus` / `NEXUS_AUTO_START=1`）。既定では起動しない。
- U2【確定】ポート再発見は **ランタイム状態ファイル方式(A)**（`<repo>/.nexus/nxc-daemon.json` に `{port,pid}`）。
- U3【確定】`--non-interactive` / CI 環境では **自動起動を抑制**し従来 fallback に落とす。
- U4【確定】nxc は daemon を停止しない（永続化）。明示停止 `nxc --stop-nexus`（状態ファイルの pid へ SIGTERM）は初期スコープ外の将来検討。
- U5【確定】`--project-root` には **git toplevel**（`git rev-parse --show-toplevel`）を渡す。

---

## 8. 受け入れ基準

1. Nexus 未起動状態で `nxc`(auto-start 有効) 実行 → daemon 起動 → context 取得しコミット生成。
2. nxc 終了後も Nexus daemon が生存している（`ps` / 再 health check で確認）。
3. 2回目の `nxc` 実行で**新規 spawn せず**既存 daemon を再利用（状態ファイル経由）。
4. ポート番号はユーザー編集ファイルに存在しない（自動採番 + ランタイム状態のみ）。
5. Nexus 起動不可（Node<24 等）でも従来 fallback で正常にコミット生成できる。
6. `--doctor` が Node 版・nexus バイナリ・embed モデル・daemon 状態を報告。
7. `npm run typecheck && npm test && npm run lint && npm run format:check` 全通過。
8. 既存テスト・既存挙動（明示 `NEXUS_API_URL` 指定時）に回帰がない。
