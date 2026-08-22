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
etc/                    # ストア掲載用のスクリーンショット・アイコン（配布物ではない）
```

ビルド工程はない。`src/` をそのまま zip して配布する。外部ライブラリ・実行時依存はゼロ。

## アーキテクチャ

`service_worker.js` 1ファイルのイベント駆動。状態は Chrome 側（`tab.mutedInfo`）と
`chrome.storage.session` にのみ持ち、Service Worker 内に永続的な状態を置かない。

| イベント | 処理 |
|---|---|
| `runtime.onInstalled` / `runtime.onStartup` | `syncAllTabs()` — 全タブをミュートし、アイコンを同期 |
| `tabs.onCreated` | `muteTab()` |
| `tabs.onUpdated` (`status === 'loading'`) | `muteTab()` — ページ遷移のたびに再ミュート |
| `tabs.onUpdated` (`changeInfo.mutedInfo`) | アイコン更新＋ユーザー操作なら記録更新 |
| `tabs.onRemoved` / `tabs.onReplaced` | アンミュート記録の破棄・引き継ぎ |
| `action.onClicked` | ミュート状態のトグル＋記録更新 |

### ミュート方針

デフォルトは「常にミュート」。ただし**ユーザーが明示的にアンミュートしたタブは、
そのタブを閉じるまで再ミュートしない**。この例外を `chrome.storage.session` の
`unmutedTabs`（タブIDの配列）で管理している。

## 設計上の決定（変更前に読むこと）

- **`permissions` は `storage` のみ**。`chrome.tabs.update({muted})` と `tabs.query({})` は
  権限不要で動く（`url` / `title` / `favIconUrl` に触れないため `tabs` 権限は要らない）。
  インストール時の権限警告が出ない状態を維持したいので、安易に権限を増やさない。

- **`chrome.storage.session` を使う理由**: MV3 の Service Worker は約30秒のアイドルで停止し、
  メモリ上の変数は失われる。アンミュートの選択を Set でメモリ保持すると、
  ユーザーがアンミュートした直後に SW が落ちて選択が消える。
  `storage.session` はブラウザセッション中ディスクに書かずに保持されるため、この用途に合う。
  ブラウザ再起動でクリアされるのは意図した挙動（毎回ミュートから始まる）。

- **`muteTab()` の早期 return は `tab.mutedInfo?.muted === true` に限定している**。
  以前は `if (tab && tab.mutedInfo && !tab.mutedInfo.muted)` というガードで、
  `mutedInfo` が取れないときに何もせず抜けていた。これが「たまにミュートされない」原因だった。
  `chrome.tabs.update(id, {muted: true})` は冪等なので、状態が不明なら適用してよい。

- **`mutedInfo.reason` でユーザー操作と拡張機能の操作を区別している**。
  タブのスピーカーアイコンからの操作は `'user'`、`chrome.tabs.update` 経由は `'extension'`。
  `'user'` のときだけ記録を更新することで、拡張機能自身の変更を誤ってユーザーの意思として
  記録するのを防いでいる。

- **`serialize()` で storage の read-modify-write を直列化している**。
  複数のタブイベントが並行すると get→set の間に別の更新が挟まり、記録が失われるため。

- **`onUpdated` では `changeInfo` を必ず見る**。以前は全更新で `setIcon` を呼んでいた。
  `changeInfo.mutedInfo` があるときだけアイコンを更新する。

- **アイコンは `chrome.action.setIcon({tabId})` でタブ単位に設定する**。
  未設定のタブには manifest の `default_icon`（ミュートアイコン）が使われるため、
  `syncAllTabs()` で起動時に明示的に同期している。

## 開発

```bash
npm run lint        # eslint 9 + neostandard（standard スタイル: セミコロンなし）
npm run lint -- --fix
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

自動テストはない。Chrome API のモックが必要になるため、現状は手動確認のみ。

## リリース

1. **バージョンを2箇所更新する**（`src/manifest.json` と `package.json`）。同期漏れに注意
2. `npm run lint` が通ることを確認
3. `src/` を zip 化してウェブストアにアップロード（`src.zip` は `.gitignore` 済み）

## 未実装

- オプションページ（ユーザー設定）
- ドメインごとの例外設定
- キーボードショートカット（`commands` API）

## 制約

- MV3 の Service Worker はコールドスタートに数百 ms かかるため、
  タブ生成から `onCreated` 到達までの間に音声が再生され始める窓が構造的に残る。完全には塞げない。
