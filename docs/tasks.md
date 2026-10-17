# 残りのタスク

## 要約

まだ済んでいないタスクの一覧。済んだ行は、その作業の commit で消す（繰り返すタスクは消さない）。
「本人」はこのリポジトリの持ち主（開発者）のこと。
着手が未定の要件（優先度が「希望」のもの）は、ここには載せない（[requirements.md](requirements.md)）。

## AI がやること

- [ ] 依存を最新に上げて全テストを流し、Chrome の挙動の変化に早く気づく（毎月 1 回の繰り返し）。
  `@playwright/test` と同梱の Chromium（`npx playwright install chromium`）、ESLint・neostandard、間接の依存を上げる。
  上げられない依存は、理由を残して据え置く。テストが落ちたら Chrome が変わったのかを調べて直す（版を上げるかは本人が決める）

## 本人がやること

なし
