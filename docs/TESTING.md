# テスト

## 実行方法

```bash
npm install
npx playwright install chromium   # 初回のみ

npm test                # ヘッドレス実行（約1分20秒。うち約50秒は Service Worker のアイドル停止待ち）
npm run docs:tests      # docs/TEST-CATALOG.md を再生成

npx playwright test tests/mute.spec.mjs         # ファイル単位
npx playwright test -g "無効化"                  # テスト名で絞る
```

### 配布物そのものをテストする

既定では `src/` を読み込むが、`EXTENSION_PATH` で読み込む対象を差し替えられる（SPEC-PKG-03）。
`npm run package` で作った zip を展開して流せば、**実際に配布するものが動くか**を確かめられる。

```bash
npm run package
rm -rf /tmp/silent-tab-pkg
unzip -q dist/silent-tab-<version>.zip -d /tmp/silent-tab-pkg
EXTENSION_PATH=/tmp/silent-tab-pkg npm test
```

リリース前にはこれを実行する（zip の詰め忘れ・パス間違いを検出できる）。

## 何をどう検証するか

| 層 | 対象 | 手段 | 実行 |
| --- | --- | --- | --- |
| **自動** | ミュートの判定・同期・目印・アイコンの設定、更新・無効化・再起動・アイドル停止、zip の作成 | Playwright（一覧は [TEST-CATALOG.md](TEST-CATALOG.md)） | `npm test` |
| **静的** | manifest の構造・権限ゼロ・参照先の実在・バージョンの一致 | `scripts/validate-manifest.mjs` | `npm run validate` |
| **手動** | 実際に音が鳴らないこと、タブのスピーカーを押す操作、描画されたアイコンの見た目 | チェックリスト | [MANUAL-CHECKLIST.md](MANUAL-CHECKLIST.md) |

**自動でテストできるものは自動でテストする。** 手動確認に回すのは、自動化できないと確かめたものだけにする（`AGENTS.md`）。

## 自動テストの仕組み

`tests/fixtures/extension.mjs` が、拡張機能を読み込んだ Chromium を1つ操作する。

| やりたいこと | 方法 | 注意 |
| --- | --- | --- |
| 拡張機能を読み込む | Chromium を `--headless=new --remote-debugging-port=0 --enable-unsafe-extension-debugging` で直接起動し、CDP の `Extensions.loadUnpacked` で読み込む | Playwright の `--load-extension` で読み込むと、再読み込み（更新）で拡張機能が消える |
| 更新する | 同じパスで `Extensions.loadUnpacked` を呼び直す（`onInstalled` の reason は `update`） | |
| 無効化→再有効化 | `chrome://extensions/` を開き、そのページで `chrome.management.setEnabled(id, false / true)` を呼ぶ | WebUI なので `management` が使える |
| ブラウザを再起動する | `--load-extension` と `--restore-last-session` で起動し、CDP の `Browser.close` で正常終了させてから起動し直す | CDP で読み込んだ拡張機能は再起動の後に残らない |
| タブのミュート状態を読む | Service Worker の中で `chrome.tabs.query({})` を呼び、`mutedInfo` を読む | `tabs` 権限が無くても読める。URL は読めないので、タブは開く前後の ID の差で特定する |
| アイコンを押す | CDP の `Extensions.triggerAction` に、そのタブの tab ターゲット ID を渡す | 実際の `action.onClicked` が発火する |
| アイコンの表示を見る | Service Worker の中で `chrome.action.setIcon` を差し替え、タブごとに最後に渡した画像を記録する | 描画された見た目は見ない（手動確認 M-3） |
| Service Worker をアイドル停止させる | `connectOverCDP` の `browser.close()` で切断し、45 秒待ってから再接続し、タブを開いて起こす | DevTools が接続している間は止まらない。`Target.closeTarget` でも止まらない |

Service Worker を拾うときは、URL が `chrome-extension://<この拡張機能の ID>/service_worker.js` のものに絞る
（Chromium に内蔵の別の拡張機能の Worker を拾うことがある）。

**テストは直列で回す**（`playwright.config.mjs` の `workers: 1`）。時間待ちを含むテストがあり、並列にしたときの安定性は確かめていない。

画面を出して実行する方法は無い（fixture が Chromium を `--headless=new` で直接起動するため、`--headed` は効かない）。

## 自動化できないと確かめたもの

| 対象 | 確かめたこと | 代わりに何で見るか |
| --- | --- | --- |
| タブのスピーカーを押す操作（`reason: 'user'` になる） | 2026-10-12。ヘッドレスにはタブの見出しが無く、CDP にミュートを操作するコマンドが無い。`chrome://extensions` のページには `chrome.tabs` が無い | 押した後の判定は `muteTab` に同じ `mutedInfo` を渡して直接呼ぶ（`ミュートの判定`）。押す操作そのものは手動確認 M-2 |
| 実際に音が鳴らないこと | テストは `mutedInfo` を見る。音声の出力は見ない | 手動確認 M-1 |
| タブを開いてから Service Worker が動き出すまでの音声 | 構造的に塞げない（CON-05） | 確認しない |
