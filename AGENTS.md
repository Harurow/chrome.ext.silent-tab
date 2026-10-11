# 静寂（Silent Tab）

Chrome 拡張機能（Manifest V3）。タブを常にミュート状態に保ち、予期しない音声再生を防ぐ。
Chrome ウェブストアで公開中: https://chromewebstore.google.com/detail/gaomeihjahnankimbcfcpgadfoldhebk

## 構成

```text
src/                    # 拡張機能本体（Chrome にはこのディレクトリを読み込ませる）
├── manifest.json
├── service_worker.js   # 全ロジックがここに集約されている
├── _locales/{en,ja}/messages.json
└── images/{muted,unmuted}{16,24,32,48,128,256}.png
scripts/package.mjs     # 配布用 zip の作成（npm run package）
dist/                   # 配布用 zip の出力先（.gitignore 済み）
etc/                    # ストア掲載用のスクリーンショット・アイコン（配布物ではない）
```

ビルド工程はない。`src/` をそのまま zip して配布する（`npm run package`）。外部ライブラリ・実行時依存はゼロ。

## アーキテクチャ

`service_worker.js` 1ファイルのイベント駆動。**状態は一切持たない** —
必要な情報はすべて Chrome 側の `tab.mutedInfo` から読み取る。

| イベント | 処理 |
|---|---|
| `runtime.onInstalled` / `runtime.onStartup` | `syncAllTabs()` — 全タブをミュートし、アイコンを同期 |
| Service Worker の起動（トップレベル） | `syncAllTabsIfNeeded()` — 同期済みの目印が無ければ `syncAllTabs()`（無効化→再有効化の検出） |
| `tabs.onCreated` | `muteTab()` |
| `tabs.onUpdated` (`status === 'loading'`) | `muteTab()` — ページ遷移のたびに再ミュート |
| `tabs.onUpdated` (`changeInfo.mutedInfo`) | アイコン更新 |
| `action.onClicked` | ミュート状態のトグル |

### ミュート方針

デフォルトは「常にミュート」。ただし**ユーザーが明示的にアンミュートしたタブは、
そのタブを閉じるまで再ミュートしない**。

この例外の判定には `tab.mutedInfo.reason` を使う。`reason` は「最後にミュート状態を
変更した理由」で、**一度も変更されていないタブでは未設定**になる。
この拡張機能は自動的にアンミュートしないため、「アンミュート状態かつ `reason` あり」は
誰かが意図的にアンミュートしたことを意味する。

| タブの状態 | `mutedInfo` | 判定 |
|---|---|---|
| 新規タブ | `{muted: false}` | ミュートする |
| ミュート済み | `{muted: true, reason: 'extension'}` | 何もしない |
| アイコンでアンミュート | `{muted: false, reason: 'extension'}` | スキップ |
| タブのスピーカーでアンミュート | `{muted: false, reason: 'user'}` | スキップ |

## 設計上の決定（変更前に読むこと）

- **`permissions` は空**。`chrome.tabs.update({muted})` と `tabs.query({})` は
  権限なしで動く（`url` / `title` / `favIconUrl` に触れないため `tabs` 権限は要らない）。
  インストール時に権限警告が出ない状態を維持したいので、**権限は増やさない**。
  これは製品の売りなので、実装の都合で権限を足す前に別の手段を探すこと。

- **状態を自前で持たない**。v1.1.0 の実装では `chrome.storage.session` に
  アンミュートしたタブIDを記録していたが、`storage` 権限が必要になるうえ、
  読み書きの直列化・タブ削除時の破棄・`onReplaced` でのID引き継ぎが必要で複雑だった。
  `mutedInfo.reason` は Chrome が同じ情報を保持しているので、二重管理をやめた。

- **`syncAllTabs()` は `muteTab(tab, true)` で強制ミュートする**。
  ブラウザ再起動で復元されたタブが前セッションの `reason` を保持している可能性があるため、
  起動時だけは `reason` を無視する。これがないと再起動後もアンミュートが引き継がれうる。
  **`onInstalled` の `reason === 'update'`（拡張機能の更新・再読み込み）でも強制が必要**。
  Chrome は拡張機能をアンロードするとき、その拡張機能がミュートしたタブを**すべてアンミュートする**。
  このとき `mutedInfo` は `{muted: false, reason: 'extension', extensionId: 自分}` になり、
  アイコンでアンミュートした状態と区別できない。強制しないと更新のたびに全タブがアンミュートのまま残る。
  （「更新時はユーザーのアンミュートを尊重する」修正を試みて Playwright で検証し、この挙動を踏んだ）

- **無効化→再有効化は「同期済みの目印」で検出する**。
  無効化でも上記のアンミュートが起きるが、再有効化では `onInstalled` も `onStartup` も発火しない。
  そのため `syncAllTabs()` がグローバルなバッジ背景色（`SYNCED_MARKER_COLOR`）を目印として設定し、
  Service Worker の起動ごとに `syncAllTabsIfNeeded()` が目印の有無を確認する。
  グローバルな action の状態は **SW のアイドル停止→再起動では保持され、拡張機能のアンロードでリセットされる**
  （どちらも Playwright で確認済み）。バッジのテキストは設定しないので表示には影響しない。
  `storage` を使わずに済ませるための手段なので、目印の判定に失敗したときは同期しない側に倒している
  （同期する側に倒すと、SW が起動するたびにユーザーのアンミュートが取り消される）。

- **`muteTab()` の早期 return は `tab.mutedInfo?.muted === true` に限定している**。
  以前は `if (tab && tab.mutedInfo && !tab.mutedInfo.muted)` というガードで、
  `mutedInfo` が取れないときに何もせず抜けていた。これが「たまにミュートされない」原因だった。
  `chrome.tabs.update(id, {muted: true})` は冪等なので、状態が不明なら適用してよい。

- **アイコンは `chrome.action.setIcon({tabId})` でタブ単位に設定する**。
  未設定のタブには manifest の `default_icon`（ミュートアイコン）が使われるため、
  `syncAllTabs()` で起動時に明示的に同期している。

- **ページ遷移すると `setIcon` のタブ固有設定が Chrome によってリセットされる**。
  そのため `onUpdated` では `changeInfo.mutedInfo` だけでなく
  `changeInfo.status` の変化時にもアイコンを設定し直している。
  「ミュート状態が変わったときだけ setIcon する」という最適化は一見正しく見えるが、
  遷移後にアイコンだけ default_icon（＝ミュート表示）に戻り、
  実際はアンミュートなのにミュートされたように見えるバグを生む。実際に踏んだ。

## 開発

```bash
npm run lint        # eslint 9 + neostandard（standard スタイル: セミコロンなし）
npm run lint -- --fix
npm run package     # dist/silent-tab-<version>.zip を作成
```

設定は `eslint.config.mjs`（フラット設定）。`chrome` は `env: ['browser', 'webextensions']` で解決。

### 動作確認

1. `chrome://extensions/` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」→ `src/`
2. `service_worker.js` の `DEBUG` を `true` にすると Service Worker のコンソールにログが出る
3. 確認すべき挙動:
   - 新規タブ → ミュート
   - 既存タブで別サイトへ遷移 → ミュート
   - アイコンでアンミュート → 遷移してもアンミュートのまま
   - そのタブを閉じて開き直す → ミュートに戻る
   - ブラウザ再起動 → 全タブミュート
   - `chrome://extensions/` から再読み込み（＝更新扱い）→ 全タブミュート（アンミュートしていたタブも戻る）
   - `chrome://extensions/` で無効化→有効化 → 全タブミュート（アンミュートしていたタブも戻る）
   - アンミュートしたタブを置いたまま 30 秒以上放置（SW がアイドル停止）→ 別タブを開いてもアンミュートのまま

自動テストはない。Chrome API のモックが必要になるため、現状は手動確認のみ。

## リリース

1. **バージョンを更新する**。`npm version <x.y.z> --no-git-tag-version`（`package.json` と `package-lock.json`）と
   `src/manifest.json` の手動更新。同期漏れに注意
2. `npm run lint` が通ることを確認
3. 変更をコミットする（`npm run package` は `src/` に未コミットの変更や未追跡ファイルがあると失敗する）
4. `npm run package` で `dist/silent-tab-<version>.zip` を作成し、ウェブストアにアップロード。
   `DEBUG` が `true` のときや、`src/manifest.json`・`package.json`・`package-lock.json` の
   バージョンが一致しないときも失敗する

## 未実装

- オプションページ（ユーザー設定）
- ドメインごとの例外設定
- キーボードショートカット（`commands` API）

## 制約

- MV3 の Service Worker はコールドスタートに数百 ms かかるため、
  タブ生成から `onCreated` 到達までの間に音声が再生され始める窓が構造的に残る。完全には塞げない。
