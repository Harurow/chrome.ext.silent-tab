# 仕様書

**現在の実装がどうなっているか**を記述する。あるべき姿ではない。

最終更新: 2026-10-12（初版） / 対象バージョン: 1.1.1

## 一覧

| ID | ファイル | 対象 | 主な実装 |
| --- | --- | --- | --- |
| `SPEC-MF` | [manifest.md](manifest.md) | 拡張機能の宣言・権限・アイコン・ロケール | `src/manifest.json`, `src/_locales/`（検査は `scripts/validate-manifest.mjs`） |
| `SPEC-SW` | [service-worker.md](service-worker.md) | ミュートの判定・同期・アイコン | `src/service_worker.js` |
| `SPEC-PKG` | [packaging.md](packaging.md) | 配布用 zip の作成と検査 | `scripts/package.mjs` |

## 記述の約束

- 各項目に ID（`SPEC-<領域>-<連番>`）を振る
- 各項目に **対応する要件** と **検証方法** を書く
- **既存 ID は再利用しない。** 廃止する場合は「廃止」と明記して欠番にする
- 実装の場所は関数名で示す（行番号はずれるので書かない）
- **値を写さない。** バージョンのように実物が正本のものは、仕様に値を書かず参照先だけを書く

検証方法の書き方:

| 表記 | 意味 |
| --- | --- |
| `auto` | 自動テスト。`tests/` のテスト名を添える（一覧は [TEST-CATALOG.md](../TEST-CATALOG.md)） |
| `validate` | `npm run validate`（`scripts/validate-manifest.mjs`）が検査する |
| `review` | 機械的には見ていない。レビューで確かめる |
| `manual` | 手動確認。[MANUAL-CHECKLIST.md](../MANUAL-CHECKLIST.md) の番号を添える |

## 実装前の仕様の扱い

仕様書は原則「**今そうなっていること**」を書く。
まだ実装していない決定は、次の注記で**予定と分かるように**書き、実装後に architect が注記を外す。

```markdown
> **状態: 未実装（予定）。** 要件は FR-xx。実装後に architect がこの注記を外す。
```

### 実装が確定していない仕様（2026-10-12 / 1.1.1 時点）

| SPEC | 要件 | 状態 | 内容 |
| --- | --- | --- | --- |
| — | — | — | **（無し）** |

> **空になっても表ごと消さない。** 消すと「まだ書いていない」のか「1件も無い」のかが読めなくなる。
