# 検証の入口

## 要約

確かめる手順は [notes/testing.md](notes/testing.md)、確認項目は [TEST-CATALOG.md](TEST-CATALOG.md)（自動）と [notes/manual-checklist.md](notes/manual-checklist.md)（手動）に置いている。
`TEST-CATALOG.md` は `npm run docs:tests` で作る生成ファイルなので、手で書かず、場所も変えない。

## 確かめる手順

| 場面 | 手順の正本 |
| --- | --- |
| テストを流す・絞る | [notes/testing.md](notes/testing.md)「実行方法」 |
| 配布する zip そのものを試す（リリースの前） | [notes/testing.md](notes/testing.md)「配布物そのものをテストする」 |
| コミットの前（レビュー → `npm run approve` → commit） | [notes/workflow.md](notes/workflow.md)「コミットゲート」 |
| 手動で確かめる | [notes/manual-checklist.md](notes/manual-checklist.md) の冒頭の「やり方」 |

コミットゲートは、承認した中身と同じものしかコミットさせないフック（`.claude/hooks/commit-gate.sh`）。

## 確認項目

| 種類 | 一覧 | 実行 |
| --- | --- | --- |
| 自動テスト（Playwright） | [TEST-CATALOG.md](TEST-CATALOG.md) | `npm test` |
| manifest の静的な検査 | [notes/testing.md](notes/testing.md)「何をどう検証するか」 | `npm run validate` |
| 手動確認（自動化できないものだけ） | [notes/manual-checklist.md](notes/manual-checklist.md) | 人が操作する |

どの層で何を見るかの分け方は [notes/testing.md](notes/testing.md)「何をどう検証するか」にある。

## 結果

回ごとの結果は、ここに書き写さない。
コミットゲートが保証すること・しないことは、[notes/workflow.md](notes/workflow.md)「このゲートが保証すること / しないこと」と「制限」にある。
その保証は今のゲートのもので、ゲートが今の形になる前の commit と、Claude Code の外（端末・GUI のクライアント）で作った commit には当てはまらない。
履歴からは、どの commit がゲートを通ったかを見分けられない。

## 残った指摘

| 残っているもの | 書いてある場所 |
| --- | --- |
| 自動化できないと確かめたもの | [notes/testing.md](notes/testing.md)「自動化できないと確かめたもの」 |
| タブを開いた直後の音声は防げない | [constraints.md](notes/requirements/constraints.md) の CON-05 |
| コミットゲートが検出しない回り道 | [notes/workflow.md](notes/workflow.md)「制限」 |
