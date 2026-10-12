# SPEC-MF: 拡張機能の宣言

実装: `src/manifest.json`, `src/_locales/`

## SPEC-MF-01 基本情報

| 項目 | 値 |
| --- | --- |
| `manifest_version` | 3 |
| `name` | `__MSG_app_title__`（静寂 / Silent Tab） |
| `description` | `__MSG_app_description__` |
| `default_locale` | `en` |
| `version` | SPEC-MF-02。**この表に値を書き写さない** |

- 要件: FR-01, CON-01
- 検証: `validate`（必須フィールド・`manifest_version`・バージョンの形式）

## SPEC-MF-02 バージョンの一致

`src/manifest.json` の `version`、`package.json` の `version`、`package-lock.json` の `version` と `packages[""].version` を常に一致させる。

版を上げるときは `package.json` と `src/manifest.json` を書き換え、`npm install --package-lock-only` で `package-lock.json` を揃える
（`npm version` はコミットゲートに止められる。`docs/WORKFLOW.md`）。

- 要件: NFR-04
- 検証: `validate`（不一致で exit 1）。`npm run package` も同じ検査をする（SPEC-PKG-02）

## SPEC-MF-03 権限を宣言しない

次のキーは宣言しない（空配列は許す）。

| キー | 宣言しない理由 |
| --- | --- |
| `permissions` / `optional_permissions` | NFR-01 |
| `host_permissions` / `optional_host_permissions` | NFR-01。サイトへのアクセス権の警告が出る |

次のキーは、空配列も含めて**キー自体を置かない**。

| キー | 置かない理由 |
| --- | --- |
| `content_scripts` | `matches` に書いたサイトへのアクセス権の警告が出る（NFR-01） |
| `web_accessible_resources` | Web ページから拡張機能のファイルを読めるようにする宣言で、拡張機能を入れているかをページに見抜かれる手がかりになる（NFR-02）。使う理由も無い |

権限が無くても使える API だけで作っている:

| API | 権限が要らない理由 |
| --- | --- |
| `chrome.tabs.query({})` / `chrome.tabs.update(id, { muted })` | `url` / `title` / `favIconUrl` に触れなければ `tabs` 権限は要らない。`mutedInfo` は権限なしで読める |
| `chrome.action.*` | `action` キーの宣言だけで使える |

- 要件: NFR-01, NFR-02
- 検証: `validate`（上の表のキーが空でない、または下の表のキーがあれば exit 1）

## SPEC-MF-04 アイコン

| 宣言 | サイズ | 画像 |
| --- | --- | --- |
| `icons` | 16 / 24 / 32 / 48 / 128 / 256 | `images/muted<size>.png` |
| `action.default_icon` | 16 / 24 / 32 | `images/muted<size>.png` |

`action.default_icon` は**ミュートのアイコン**。タブごとのアイコンを設定していないタブにはこれが出る（SPEC-SW-07）。
アンミュートのアイコン `images/unmuted<size>.png` は manifest ではなく `service_worker.js` から参照する。

- 要件: FR-06
- 検証: `validate`（`icons` と `action.default_icon` の参照先、`service_worker.js` 中の `'images/*.png'` の参照先が実在するか）

## SPEC-MF-05 Service Worker

```json
"background": { "service_worker": "service_worker.js" }
```

`type: "module"` は指定しない（1ファイルで完結しており、読み込むものが無い）。

- 要件: FR-01, CON-01
- 検証: `validate`（ファイルの実在）

## SPEC-MF-06 ロケール

| ロケール | `app_title` | `app_description` |
| --- | --- | --- |
| `en`（既定） | Silent Tab | Always open tabs muted |
| `ja` | 静寂 | 必ずミュートでタブを開きます |

- 要件: FR-08
- 検証: `validate`（manifest が使う `__MSG_*__` のキーが、すべてのロケールにあるか）／ `manual`（M-4。実際の表示）
