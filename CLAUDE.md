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

`service_worker.js` 1ファイルのイベント駆動。**状態は一切持たない** —
必要な情報はすべて Chrome 側の `tab.mutedInfo` から読み取る。

| イベント | 処理 |
|---|---|
| `runtime.onInstalled` / `runtime.onStartup` | `syncAllTabs()` — 全タブをミュートし、アイコンを同期 |
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
