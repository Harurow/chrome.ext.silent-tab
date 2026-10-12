# SPEC-SW: Service Worker

実装: `src/service_worker.js`（全ロジックがこの1ファイルにある）

## SPEC-SW-01 イベントと処理の対応

イベント駆動で動く。タイマーは持たない。

| イベント | 処理 | 仕様 |
| --- | --- | --- |
| `runtime.onInstalled`（インストール・更新） | `syncAllTabs()` | SPEC-SW-03 |
| `runtime.onStartup`（ブラウザの起動） | `syncAllTabs()` | SPEC-SW-03 |
| Service Worker の起動（スクリプトの最上位） | `syncAllTabsIfNeeded()` | SPEC-SW-04 |
| `tabs.onCreated` | `muteTab(tab)` | SPEC-SW-02 |
| `tabs.onUpdated` | `muteTab(tab)` とアイコンの設定し直し | SPEC-SW-05 |
| `action.onClicked` | そのタブのミュートを切り替える | SPEC-SW-06 |

`onInstalled` の契機では、Service Worker の起動で `syncAllTabsIfNeeded()` も走り、目印がまだ無いので同期する（アンロードで目印が消えることは実測済み）。
`onStartup` の契機でも同じと見ているが、**ブラウザの再起動で目印が消えるかは未実測**。
**同期が2回走る**が、強制ミュートとアイコンの設定は何度行っても同じ結果になる。
このため自動テストは「どちらの経路で同期したか」を区別しない（片方を消してもテストは落ちない）。

- 要件: FR-02, NFR-02, NFR-06
- 検証: `auto`（`新しく開いたタブをミュートする`）／ `review`（タイマー・通信のコードが無いこと。`onInstalled` / `onStartup` のリスナーが残っていること）

## SPEC-SW-02 タブをミュートするかの判定（`muteTab`）

`muteTab(tab, force = false)` は、タブの `mutedInfo` を見て次のように振る舞う。

| タブの状態 | `mutedInfo` | `force = false` | `force = true` |
| --- | --- | --- | --- |
| 新しいタブ（ミュートを一度も変えていない） | `{ muted: false }` | ミュートする | ミュートする |
| ミュート済み | `{ muted: true, reason: … }` | 何もしない | 何もしない |
| アイコンでアンミュート | `{ muted: false, reason: 'extension' }` | **何もしない** | ミュートする |
| タブのスピーカーでアンミュート | `{ muted: false, reason: 'user' }` | **何もしない** | ミュートする |
| `mutedInfo` が分からない | なし | ミュートする | ミュートする |

**判定に使うのは `reason` の有無だけ。** `reason` は「最後にミュート状態を変えた理由」で、一度も変えていないタブには無い。
この拡張機能は自分からアンミュートしない（SPEC-SW-06 の利用者の操作を除く）ので、
「アンミュートで `reason` あり」は誰かが意図してアンミュートしたことを意味する。
アンミュートしたタブの一覧は持たない（CON-03 / ADR-0001）。

> **早期 return は `mutedInfo?.muted === true` のときだけにする。**
> 以前は `mutedInfo` が無いと何もせずに抜けており、「たまにミュートされない」原因だった。
> `chrome.tabs.update(id, { muted: true })` は何度呼んでも同じ結果になるので、状態が分からなければ適用してよい。

- 要件: FR-02, FR-05, CON-03
- 検証: `auto`（`ミュートの判定` の2件、`アイコンでアンミュートしたタブは、遷移してもアンミュートのまま…`、`アンミュートしたタブを閉じて開き直すと、ミュートに戻る`）／ `manual`（M-2。タブのスピーカーを押す操作そのもの）

## SPEC-SW-03 全タブの強制同期（`syncAllTabs`）

1. 同期済みの目印を付ける（SPEC-SW-04）
2. `chrome.tabs.query({})` で全タブを取り、**`muteTab(tab, true)` で強制的にミュートする**
3. 各タブのアイコンを設定する（SPEC-SW-07）

1〜3 は1つの `try` で囲んでいる。**1 で例外が出ると 2・3 も行わない**（`console.error` に出して終わる）。

強制する（`reason` を無視する）理由:

| 契機 | 理由 |
| --- | --- |
| ブラウザの起動 | 復元したタブが前回のセッションの `reason` を持っている可能性がある（未実測）。強制しないと、再起動後もアンミュートが引き継がれうる |
| 更新 | Chrome が全タブをアンミュートし、`reason: 'extension'` が付く（CON-04）。強制しないと全タブがアンミュートのまま残る（ADR-0002） |
| インストール | 入れる前から開いていたタブもミュートする |

- 要件: FR-07, CON-04
- 検証: `auto`（`インストール時に、開いているタブをミュートする`、`拡張機能を更新すると…`、`ブラウザを再起動すると…`）

## SPEC-SW-04 同期済みの目印（`syncAllTabsIfNeeded`）

無効化から有効に戻したときは、`onInstalled` も `onStartup` も来ない（CON-04）。
そのため **Service Worker が起動するたびに**、同期済みの目印があるかを確かめ、無ければ `syncAllTabs()` を呼ぶ。

| 項目 | 内容 |
| --- | --- |
| 目印 | グローバル（タブを指定しない）のバッジ背景色を `SYNCED_MARKER_COLOR`（`[1, 2, 3, 255]`）にする |
| 付ける | `syncAllTabs()` の最初 |
| 読む | `chrome.action.getBadgeBackgroundColor({})` |
| 残る | Service Worker のアイドル停止→再起動（Playwright で確認） |
| 消える | 拡張機能のアンロード（更新・無効化）。読み込み直すと既定の色に戻る（Playwright で確認） |
| 表示への影響 | 無い。バッジの文字を設定しないので、背景色は表に出ない |
| 読めなかったとき | **同期しない。** 同期する側に倒すと、Service Worker が起きるたびに利用者のアンミュートが消える |

設計判断は ADR-0003。

- 要件: FR-05（判定基準 4）, FR-07, NFR-03, CON-01, CON-03, CON-04
- 検証: `auto`（`無効化→再有効化すると…`、`Service Worker がアイドル停止→再起動しても…`）

## SPEC-SW-05 ページ遷移での再ミュートとアイコンの設定し直し（`onUpdated`）

| `changeInfo` | 処理 |
| --- | --- |
| `status === 'loading'` | `muteTab(tab)`（`force = false`。アンミュートしたタブはそのまま）。`onCreated` でのミュートが効かなかったタブ（`reason` が無い）を拾う |
| `mutedInfo` あり | アイコンの状態を `changeInfo.mutedInfo.muted` に合わせる |
| `status` か `mutedInfo` のどちらかがある | アイコンを設定し直す（SPEC-SW-07） |

> **`status` が変わっただけでもアイコンを設定し直す。**
> ページを遷移すると、Chrome がタブごとのアイコン（`setIcon({ tabId })`）を消し、`default_icon`（ミュートのアイコン）に戻す。
> 「ミュート状態が変わったときだけ設定する」と、遷移後にアンミュートなのにミュートのアイコンが出る。v1.1.0 の後に実際に踏んだ。

- 要件: FR-03, FR-06
- 検証: `auto`（`作成時にミュートし損ねたタブも、遷移したらミュートする`、`ページを遷移してもミュートのままで、アイコンもミュート表示になる`、`アイコンでアンミュートしたタブは、遷移してもアンミュートのままで、アイコンもアンミュート表示のまま`）

## SPEC-SW-06 アイコンのクリックで切り替える（`action.onClicked`）

押されたタブに `chrome.tabs.update(tab.id, { muted: !muted })` を呼ぶ。
アンミュートすると `mutedInfo.reason` が `'extension'` になり、以降 `muteTab` はそのタブを飛ばす（SPEC-SW-02）。
アイコンの表示は、この変更で来る `onUpdated`（`changeInfo.mutedInfo`）で変わる（SPEC-SW-05）。

- 要件: FR-04, FR-05
- 検証: `auto`（`アイコンを押すとアンミュートし、もう一度押すとミュートに戻る`）

## SPEC-SW-07 アイコンの表示（`updateTabIcon`）

`chrome.action.setIcon({ tabId, path })` で**タブごとに**設定する。

| 状態 | 画像 |
| --- | --- |
| ミュート | `images/muted{16,24,32}.png` |
| アンミュート | `images/unmuted{16,24,32}.png` |

タブごとの設定が無いタブには `action.default_icon`（ミュートのアイコン。SPEC-MF-04）が出る。
起動時は `syncAllTabs()` が全タブに設定する（SPEC-SW-03）。

- 要件: FR-06
- 検証: `auto`（`setIcon` の呼び出しを記録して見る。SPEC-SW-05・06 のテスト）／ `manual`（M-3。描画された見た目）

## SPEC-SW-08 デバッグ出力

`const DEBUG = false` を `true` にすると、`debugLog()` が Service Worker のコンソールに出力する。
エラー（`console.error`）は `DEBUG` に関係なく出す。

配布する版では `false` にする。`npm run package` が検査する（SPEC-PKG-02）。

- 要件: NFR-05
- 検証: `auto`（`DEBUG = true のままだと止まる`）
