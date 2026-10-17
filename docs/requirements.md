# 要件の入口

## 要約

満たすべきことは [notes/requirements/](notes/requirements/readme.md) に、機能（FR）・非機能（NFR）・制約（CON）に分けて置いている。
この入口は案内だけで、要件の中身は書き写さない。

## 目的

タブを常にミュートした状態に保ち、予期しない音声の再生を防ぐ。
背景・利用者・用語は [background.md](notes/requirements/background.md) にある。

## 要件

| 種類 | 正本 | ID |
| --- | --- | --- |
| 一覧（優先度と状態） | [notes/requirements/readme.md](notes/requirements/readme.md)「一覧」 | — |
| 機能要件 | [functional.md](notes/requirements/functional.md) | `FR-xx` |
| 非機能要件（権限・プライバシー・品質） | [non-functional.md](notes/requirements/non-functional.md) | `NFR-xx` |
| 制約条件 | [constraints.md](notes/requirements/constraints.md) | `CON-xx` |

ID は振り直さない（全プロジェクト共通のひな形の `R-n` には移さない）。
書き方の約束と、優先度・状態の意味は [notes/requirements/readme.md](notes/requirements/readme.md)「記述の約束」にある。

## スコープ外

[background.md](notes/requirements/background.md)「スコープ」の「対象外」にある。
希望のまま着手していない要件も、[functional.md](notes/requirements/functional.md) に状態 ❌ で残している。

## 前提

使う Chrome の機能と、シークレットウィンドウの扱いは [background.md](notes/requirements/background.md)「前提」にある。
技術と開発体制の制約は [constraints.md](notes/requirements/constraints.md) にある。
