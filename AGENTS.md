# AGENTS.md — 静寂（Silent Tab）開発ガイド

> AI エージェント（Claude Code など）が最初に読むファイル。**AI が覚えておくべきことはここに書く**
> （末尾の「[AI エージェント向けの記録](#ai-エージェント向けの記録)」）。`CLAUDE.md` は置かない。

## プロジェクト概要

タブを常にミュート状態に保ち、予期しない音声の再生を防ぐ Chrome 拡張機能。

- **拡張機能名:** 静寂 / Silent Tab
- **Manifest:** v3
- **バージョン:** `src/manifest.json` の `version`（`package.json` / `package-lock.json` と一致させる。`npm run validate` が検証する）
- **公開:** [Chrome ウェブストア](https://chromewebstore.google.com/detail/gaomeihjahnankimbcfcpgadfoldhebk)
- **ライセンス:** MIT

## クイックスタート

```bash
npm install
npx playwright install chromium   # 初回のみ

npm run lint          # ESLint
npm run fix           # 自動修正
npm run validate      # manifest.json の構造・権限ゼロ・参照先・バージョン整合を検証
npm test              # Playwright による E2E テスト（約1分20秒）
npm run check         # lint + validate + test + テストカタログが最新か
npm run docs:tests    # docs/TEST-CATALOG.md を再生成
npm run approve       # レビュー承認を記録する（コミットに必須）
npm run package       # dist/silent-tab-<version>.zip を作成
```

> **コミットは、テスト全件が通り、かつ reviewer のレビューが通るまでできない。**
> `.claude/hooks/commit-gate.sh` が機械的に止める。詳細は [docs/WORKFLOW.md](docs/WORKFLOW.md)。

### Chrome への読み込み

1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」から `src/` を指定

> ビルドステップは無い。`src/` がそのまま拡張機能として動作する。外部ライブラリ・実行時の依存はゼロ。
> `service_worker.js` の `DEBUG` を `true` にすると、Service Worker のコンソールにログが出る。

## 構成

```text
src/                        ← このディレクトリがそのまま拡張機能
├── manifest.json
├── service_worker.js       # 全ロジックがここに集約されている
├── _locales/{en,ja}/messages.json
└── images/{muted,unmuted}{16,24,32,48,128,256}.png

scripts/                    # 開発用 Node スクリプト（validate / package / test-catalog / approve）
tests/                      # Playwright テスト（fixtures/extension.mjs が拡張機能を読み込んだ Chromium を操作する）
docs/
├── tasks.md                # 入口: 残りのタスク
├── requirements.md         # 入口: 何を作るか → requirements/
├── design.md               # 入口: どう作るか → ARCHITECTURE.md・specs/・adr/
├── verification.md         # 入口: 確かめ方と結果 → TESTING.md・TEST-CATALOG.md・MANUAL-CHECKLIST.md
├── requirements/           # 要件定義（FR / NFR / CON）
├── specs/                  # 仕様書（SPEC-xx）← 実装と1対1
├── adr/                    # 設計判断の記録（ADR-xxxx）
├── ARCHITECTURE.md         # 全体像・状態をどこに持つか
├── TESTING.md              # テストの実行方法・仕組み・自動化できないもの
├── TEST-CATALOG.md         # テスト一覧（自動生成）
├── MANUAL-CHECKLIST.md     # 手動確認
└── WORKFLOW.md             # 開発フロー・エージェント・コミットゲート
etc/                        # ストア掲載用のスクリーンショット・アイコン（配布物ではない）
dist/                       # 配布用 zip の出力先（.gitignore 済み）

.claude/
├── agents/                 # 要件 / 設計 / 実装 / レビュー / 調整のエージェント定義
├── hooks/commit-gate.sh    # コミットゲート（PreToolUse）
└── settings.json           # フック設定
```

### ドキュメントの役割分担

| ディレクトリ | 書くもの | 担当エージェント |
| --- | --- | --- |
| `docs/tasks.md` | **残りのタスク**（AI の分・利用者の分）。済んだ行は、その作業の commit で消す | メインセッション |
| `docs/requirements.md`, `docs/design.md`, `docs/verification.md` | 入口。下の文書へ案内するだけで、中身は書き写さない | 案内する先の担当 |
| `docs/requirements/` | **満たすべきこと**（FR / NFR / CON） | analyst |
| `docs/specs/` | **今そうなっていること**（SPEC-xx）。実装と1対1 | architect |
| `docs/adr/` | **なぜその作りにしたか**。選ばなかった案と理由 | architect |
| `docs/TESTING.md`, `docs/MANUAL-CHECKLIST.md` | テストの方法・自動化できないもの・手動確認 | developer |
| `src/`, `tests/` | 実装 | developer |
| — | レビュー（書き換えなし） | reviewer |

`docs/` の直下の入口 4 つ（`tasks.md`・`requirements.md`・`design.md`・`verification.md`）は、利用者のどのプロジェクトでも同じ名前にしている。
新しく書く資料で、上の場所のどれにも当たらないものは `docs/notes/` に置く（名前は英小文字とハイフン）。
索引は [docs/README.md](docs/README.md)。**仕様書は「あるべき姿」ではなく「実際にそうなっているもの」を書く。**

### エージェント

`.claude/agents/` に役割を分けて定義してある。**サブエージェントは役割をまたぐ変更をしない。**

| エージェント | 役割 | 書き換えてよい場所 |
| --- | --- | --- |
| `lead` | 全体調整。工程を回す | なし |
| `analyst` | 利用者と対話して要件を決める | `docs/requirements/`, `docs/requirements.md` |
| `architect` | 要件から設計・仕様を起こす | `docs/requirements/`, `docs/requirements.md`, `docs/specs/`, `docs/ARCHITECTURE.md`, `docs/adr/`, `docs/design.md`, `docs/README.md` |
| `developer` | 仕様に従って実装する | `src/`, `tests/`, `scripts/`, ルートの設定ファイル, `docs/TESTING.md`, `docs/MANUAL-CHECKLIST.md`, `docs/TEST-CATALOG.md`（生成）, `docs/verification.md` |
| `reviewer` | 実装と文書を突き合わせて検証する | **なし（読み取り専用）** |

`AGENTS.md`・`docs/WORKFLOW.md`・`docs/tasks.md`・`.claude/`・`README.md` / `README.ja.md` はどの担当の書き換え範囲にも入れない。書くのはメインセッション（利用者と直接やり取りしている AI）だけ。

担当を指定せずに起動したメインセッションは、この表に関係なくどの場所も自分で書き換えてよい。
`claude --agent <担当>` で起動したときは、その担当の定義（書き換えてよい場所を含む）に従う。`lead` 以外の担当はコミットもしない（続きは [docs/WORKFLOW.md](docs/WORKFLOW.md)「サブエージェントに渡す基準」）。
サブエージェントに渡すのは、独立した確認（レビュー）・並行できる作業・利用者が `claude --agent` で工程を回すと決めたときだけ（[docs/WORKFLOW.md](docs/WORKFLOW.md)「サブエージェントに渡す基準」）。

## アーキテクチャ

`service_worker.js` 1ファイルのイベント駆動。**状態は一切持たない** —
必要な情報はすべて Chrome 側（タブの `mutedInfo` と `action` のグローバルな状態）から読み取る。

| イベント | 処理 |
| --- | --- |
| `runtime.onInstalled` / `runtime.onStartup` | `syncAllTabs()` — 全タブを強制的にミュートし、アイコンを同期し、同期済みの目印を付ける |
| Service Worker の起動（スクリプトの最上位） | `syncAllTabsIfNeeded()` — 目印が無ければ `syncAllTabs()`（無効化→再有効化の検出） |
| `tabs.onCreated` | `muteTab()` |
| `tabs.onUpdated`（`status === 'loading'`） | `muteTab()` — ページ遷移のたびに再ミュート |
| `tabs.onUpdated`（`status` か `mutedInfo` の変化） | アイコンを設定し直す |
| `action.onClicked` | そのタブのミュートを切り替える |

**ミュートの方針:** 既定は「常にミュート」。ただし**利用者がアンミュートしたタブは、閉じるまでミュートし直さない**。
判定は `tab.mutedInfo.reason` の有無で行う（SPEC-SW-02 の表）。
起動・インストール・更新・再有効化のときだけは、アンミュートしていたタブも含めて全タブをミュートする（FR-07）。

全体像は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、詳細は [docs/specs/service-worker.md](docs/specs/service-worker.md)。

## ⚠️ 変更前に読むこと

どれも、一見正しい「改善」で壊れる箇所。理由と選ばなかった案は仕様・ADR にある。

| 決まりごと | 破るとどうなるか | 根拠 |
| --- | --- | --- |
| **権限を宣言しない**（`permissions` は空） | インストール時に警告が出る。**製品の売り**なので、権限を足す前に別の手段を探す | NFR-01 / SPEC-MF-03 |
| **状態を自前で持たない**（`storage` も SW のグローバル変数も使わない） | 権限が要る。SW の停止で消える。1.1.0 は `storage.session` に持っていて複雑だった | CON-03 / ADR-0001 |
| **`syncAllTabs()` は強制ミュート**（`muteTab(tab, true)`） | 更新のたびに全タブがアンミュートのまま残る。Chrome はアンロード時に全タブをアンミュートし、利用者のアンミュートと区別できない | CON-04 / ADR-0002 |
| **SW の起動ごとに `syncAllTabsIfNeeded()`**。目印が読めなければ同期しない | 再有効化の後に全タブがアンミュートのまま残る。同期する側に倒すと、SW が起きるたびに利用者のアンミュートが消える | ADR-0003 |
| **バッジの背景色は目印専用** | 目印が壊れる。バッジを使う機能を足すなら目印の移し先から考える | ADR-0003 |
| **`muteTab()` の早期 return は `mutedInfo?.muted === true` だけ** | `mutedInfo` が取れないときにミュートされない（「たまにミュートされない」の原因だった） | SPEC-SW-02 |
| **`status` が変わっただけでもアイコンを設定し直す** | 遷移後にアンミュートなのにミュートのアイコンが出る。Chrome が遷移でタブごとのアイコンを消すため。実際に踏んだ | SPEC-SW-05 |

## コーディング規約

- **JavaScript（ES2021+）**、TypeScript は使わない。ビルドしない（CON-02）
- **インデント:** スペース 2（`.editorconfig`）／**改行:** LF ／**文字コード:** UTF-8
- **セミコロンなし・シングルクォート**（ESLint 9 + [neostandard](https://github.com/neostandard/neostandard)。flat config: `eslint.config.mjs`）
- コメントは日本語

> Markdown の lint（markdownlint-cli2）は入れていない。2026-10-12 時点で、どの版を入れても
> 依存に修正版の無い high の脆弱性（`braces` の [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) など）が付いてくるため
> （markdownlint-cli2 0.23.3 を一時ディレクトリに入れて `npm audit` で確認。kabu-tantan は入れている）。

### バージョニング

セマンティックバージョニング。`src/manifest.json` と `package.json` の**両方**を書き換え、
`npm install --package-lock-only` で `package-lock.json` を同期する（`npm run validate` が3者の不一致を検出する。SPEC-MF-02）。

> `npm version` はコミットゲートに止められる（中でコミットしうるため）。使わない。

## テスト

Playwright で拡張機能を実際に Chromium へ読み込んで検証する。詳細は [docs/TESTING.md](docs/TESTING.md)。

| ファイル | 対象 |
| --- | --- |
| `tests/mute.spec.mjs` | 新しいタブ・遷移でのミュート、`muteTab` の判定、アイコンでの切り替えと表示 |
| `tests/lifecycle.spec.mjs` | 更新・無効化→再有効化・ブラウザの再起動・Service Worker のアイドル停止 |
| `tests/package.spec.mjs` | `npm run package` の zip 作成と検査 |
| `tests/commit-gate.spec.mjs` | コミットゲートのフック: コミットされる中身（index）が承認した中身と同じときだけ通すこと、commit 以外でコミットを作るコマンドを止めること、承認の記録（`npm run approve`）の条件（一時の git リポジトリで。ブラウザは起動しない） |

テストの一覧は [docs/TEST-CATALOG.md](docs/TEST-CATALOG.md)（`npm run docs:tests` で自動生成）。
**テストを増減したらこれを再生成すること**（`npm run check` が陳腐化を検出する）。

作業の途中は、変えた所に関係するテストだけを流してよい（`npx playwright test tests/mute.spec.mjs`、`-g` で名前を絞る）。
`lifecycle.spec.mjs` のアイドル停止のテストは1件で約50秒かかるので、関係しない変更なら途中では外してよい（`npx playwright test --grep-invert アイドル停止`）。
**全件はコミットの前に `npm run approve` で必ず流す。**

自動化できないものだけを [docs/MANUAL-CHECKLIST.md](docs/MANUAL-CHECKLIST.md) で手動確認する。

## 制約

- MV3 の Service Worker はコールドスタートに数百 ms かかるため、
  タブ生成から `onCreated` 到達までの間に音声が再生され始める窓が構造的に残る。完全には塞げない（CON-05）

## AI エージェント向けの記録

**AI が覚えておくべきことは、このファイルに書く。** 個人用のメモリ（Claude Code の auto memory など）には置かない。

**書くのはメインセッション**（利用者と直接やり取りしている AI）。サブエージェントは書かず、
記録すべきことに気づいたら報告に書いてメインセッションに渡す。本ファイルの変更もコミットゲートを通す。

`claude --agent lead` / `claude --agent analyst` のように担当を指定して起動したセッションも、本ファイル・`docs/WORKFLOW.md`・`.claude/` は書かない（その担当の書き換えてよい場所の外にあるため）。
記録すべきことは利用者への報告に書き、担当を指定せずに起動したセッションで書いてもらう。

| 書く | 書かない |
| --- | --- |
| この拡張機能で繰り返し効く規則・手順、実行環境の癖、利用者との進め方の取り決め | 進行中の状態（どの版を申請したか、次の一手、未決の質問など）、個人情報、コードや git 履歴から読み取れること |

残りのタスクは [docs/tasks.md](docs/tasks.md) に置く。進行中の状態は、git log・docs と、利用者の Obsidian のプロジェクトノートに残す。
Chrome 拡張機能に共通する取り決めとノウハウは、利用者の共通ルール `~/.claude/rules/chrome-extensions.md` に書く。**このリポジトリで作業するときは、着手前にそのファイルを読む。**
kabu-tantan と共通の進め方（依頼の出し方・自動テスト優先・リリースの分担・図の書き方）、Chrome の挙動の実測、Playwright での試し方がそこにある（2026-10-12 にここから移した）。
この2つはこのリポジトリの持ち主の環境での決まりで、ほかの人の環境では従わなくてよい。ここには、この拡張機能に固有のことだけを書く。

### `CLAUDE.md` は置かない

指示ファイルは `AGENTS.md` だけにする。`@AGENTS.md` だけを書いた `CLAUDE.md` も足さない（2026-10-11 利用者判断）。
Claude Code は v2.1.277 以降、作業ディレクトリとその上に `CLAUDE.md`（`.claude/CLAUDE.md`・`CLAUDE.local.md` を含む）が無ければ `AGENTS.md` を読む。
利用者の `~/.claude/CLAUDE.md` はこの判定に数えないので、あっても `AGENTS.md` は読まれる（[公式ドキュメント](https://code.claude.com/docs/en/memory)。2026-10-12 に確認）。

> 2026-10-11、「Claude Code は `CLAUDE.md` しか読まない」という古い知識のまま読み込み用の `CLAUDE.md` を足し、
> 「しっかり調べてください」と指摘された。ツールの挙動を前提にする前に、手元の版（`claude --version`）と公式ドキュメントを確かめる。

### 修正したら、レビュー → テスト → コミット → push までをセットで行う

**確認（手順2のレビューと手順3のテスト）は必ず行う。全部 OK だったら、利用者に聞かずにコミットして push する。**
OK でないものが1つでもあれば、コミットしない。

| 確認 | OK の基準 |
| --- | --- |
| レビュー | 🔴 Critical が無いこと（`docs/WORKFLOW.md` のゲートと同じ）。🟡 は直すか、直さない理由を報告に書く |
| テスト | `npm run approve`（中で `npm run check` を全件流す）が通ること |

1. 修正する。振る舞いを変えたらテストを足す・直し、関係するテストを流す（「テスト」の節）
2. reviewer のレビューを通す。OK が出なければ直して、もう一度レビューを通す
3. `npm run approve` でテストする（`npm run check` を全件流し、通れば承認を記録する）。通らなければ直して手順2から
4. 変更を**すべて**コミットする（一部だけ `git add` すると、テストしていない組み合わせが履歴に入りうる）。
   一部だけのコミットや、ステージした中身と作業ツリーのずれはゲートが止める（2026-10-14〜）。`git add -A && git commit` の形で行う。
   `merge`・`cherry-pick`・`revert`・`rebase`・`am`・`git pull`（`--ff-only` か `--dry-run` 以外）は、承認があっても止まる（2026-10-15〜）。
   途中で止まったものの `--continue` は `git commit` と同じく確かめる（後に手順が残っていれば止まる）。`git add -A && GIT_EDITOR=true git merge --continue` の形で行う（エディタを開かせない）。要るときは利用者に相談する。
   **`npm run approve` とコミットは別々の Bash 呼び出しで行う**（フックは呼び出しを実行する前に判定する）
5. push する。手順3のテストで足りるので流し直さない（承認とコミットの間に何か変えたら、手順2からやり直す）

完了の報告には、テスト・レビュー・コミット・push のそれぞれの結果と、リリース（パッケージ作成・ストアへの申請）が要るかを書く。

> 利用者の言葉（2026-10-11、kabu-tantan）: 「Code修正したらテストして、まあその前にレビューか。
> レビューしてOKだったらテストして、コミットしてプッシュ。ここまでがセット。」
>
> 2026-10-12、レビューもテストも全部 OK だったのに「コミットして push してよいですか？」と利用者に聞き、
> 本ファイルにも「push の前に利用者へ確認しない」（＝確認せずに push する、とも読める）と書いていた。
> 利用者の言葉（2026-10-12、silent-tab）: 「逆ですね。確認しなきゃダメですね。確認して全部OKだったら、コミットしてプッシュですね。」

この言葉の解釈（AI による）: **省いてよいのは利用者への伺いで、確認（レビューとテスト）は省かない。**
「確認」をレビューとテストに絞ったこと、「全部 OK」の基準を上の表にしたことも解釈である。違っていたら直す。

### リリース

AI と利用者の分担は共通ルール（`chrome-extensions.md`）に従う。この拡張機能で足す手順:

- 版を上げるのは、上の流れのコミットの前（「バージョニング」の手順）
- アップロードの後、注記付きのタグ `<version>` を付けて push する。`v` は付けない（既存のタグ `1.0.0` / `1.1.1` に合わせる）。
  注記には版と主な変更を箇条書きで書く（`git cat-file -p 1.1.1` が例）
- `npm run package` は、`src/` に未コミットの変更があると止まる（SPEC-PKG-02）。
  リリース前には zip を展開して `EXTENSION_PATH=<展開先> npm test` を流す（[docs/TESTING.md](docs/TESTING.md)）
