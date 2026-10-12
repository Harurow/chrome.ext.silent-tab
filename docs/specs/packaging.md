# SPEC-PKG: 配布用 zip の作成

実装: `scripts/package.mjs`（`npm run package`）

## SPEC-PKG-01 zip の作成

`src/` の中身をそのまま `dist/silent-tab-<version>.zip` に固める（ビルドしない。CON-02）。

| 項目 | 内容 |
| --- | --- |
| 出力先 | `dist/silent-tab-<version>.zip`（`<version>` は `src/manifest.json` の値）。同名のファイルは上書きする |
| 除外 | `.DS_Store`, `__MACOSX/` |
| `dist/` | `.gitignore` 済み |

- 要件: FR-01, NFR-05, CON-02
- 検証: `auto`（`src/ がコミット済みなら zip を作り、中身はコミットした src/ と一致する`）

## SPEC-PKG-02 作成前の検査

次のどれかに当たると、zip を作らずに失敗する。

| 検査 | 理由 |
| --- | --- |
| `src/` に未コミットの変更か未追跡のファイルがある | 提出物と履歴を一致させる。コミットしてから作る |
| `service_worker.js` が `const DEBUG = false` でない | デバッグ出力を配布しない（SPEC-SW-08） |
| `src/manifest.json`・`package.json`・`package-lock.json`（`version` と `packages[""].version`）のバージョンが一致しない | SPEC-MF-02 |

- 要件: NFR-04, NFR-05
- 検証: `auto`（`src/ に未追跡のファイルがあると止まる`、`DEBUG = true のままだと止まる`、`manifest.json だけバージョンを上げると止まる`）

## SPEC-PKG-03 配布物そのものを試す

テストは既定で `src/` を読み込むが、環境変数 `EXTENSION_PATH` で読み込む対象を差し替えられる。
zip を展開したディレクトリを渡すと、**実際に配布するもの**で全テストを流せる（手順は [TESTING.md](../TESTING.md)）。

- 要件: NFR-05
- 検証: `review`（`tests/fixtures/extension.mjs` の `extensionPath`）
