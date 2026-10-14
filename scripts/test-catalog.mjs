/**
 * Playwright のテスト一覧から docs/TEST-CATALOG.md を生成する。
 * 手書きだと必ず実態とズレるため、テスト定義を唯一の情報源にする。
 */
import { writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 各テストファイルが何を守っているかの説明。ファイルを増やしたらここにも足す。
const FILE_INFO = {
  'mute.spec.mjs': {
    title: 'タブのミュートとアイコンでの切り替え',
    detail: '拡張機能を読み込んだ Chromium でタブを開き・遷移させ、Service Worker 内から `mutedInfo` を読んで検証する。' +
      'ツールバーのアイコンは CDP の `Extensions.triggerAction` で押す（実際の `action.onClicked` が発火する）。' +
      'アイコンの表示は `chrome.action.setIcon` の呼び出しを記録して見る（描画された画像は見ない）。' +
      'タブのスピーカーでのアンミュート（`reason: \'user\'`）は起こせないので、`muteTab` に同じ `mutedInfo` を渡して直接呼ぶ。',
    specs: 'SPEC-SW-01, SPEC-SW-02, SPEC-SW-03, SPEC-SW-05, SPEC-SW-06, SPEC-SW-07'
  },
  'lifecycle.spec.mjs': {
    title: '拡張機能の更新・無効化と、ブラウザ・Service Worker の再起動',
    detail: '更新は CDP の `Extensions.loadUnpacked` を同じパスで呼び直して起こす（`onInstalled` の reason は `update`）。' +
      '無効化→再有効化は `chrome://extensions` の WebUI から `chrome.management.setEnabled` を呼ぶ。' +
      'ブラウザの再起動は `--load-extension` と `--restore-last-session` で起動し直す。' +
      'Service Worker のアイドル停止は DevTools の接続を切って 45 秒待つ（このテストだけで約 50 秒かかる）。',
    specs: 'SPEC-SW-03, SPEC-SW-04'
  },
  'package.spec.mjs': {
    title: '配布用 zip の作成（npm run package）',
    detail: 'ブラウザを使わない。リポジトリを一時ディレクトリに複製し、そこで `scripts/package.mjs` を実行する。',
    specs: 'SPEC-PKG-01, SPEC-PKG-02'
  },
  'commit-gate.spec.mjs': {
    title: 'コミットゲート（コミットされる中身）',
    detail: 'ブラウザを使わない。一時の git リポジトリで承認を記録し、フック（`.claude/hooks/commit-gate.mjs`）に Bash の呼び出しを渡して、' +
      'コミットされる中身（index）が承認した作業ツリーの中身と同じときだけ通すことを検証する。' +
      '一部だけのステージ・パスの指定・`git commit -a` と未追跡のファイル・前に置くコマンド・シェル経由・場所の変更・ヒアドキュメント・引用符とリダイレクトを見る。',
    specs: 'docs/WORKFLOW.md「コミットされる中身を確かめる」'
  }
}

// 回帰テストとして特に重要なもの（テスト名の部分一致で判定）
const REGRESSION = {
  アイコンもアンミュート表示のまま: '遷移で Chrome が `setIcon` のタブ固有設定を消し、アンミュートなのにミュート表示に戻る退行の検出（SPEC-SW-05。v1.1.0 の後に実際に踏んだ）',
  拡張機能を更新すると: '更新時に強制ミュートをやめ、全タブがアンミュートのまま残る退行の検出（ADR-0002 / FR-07）',
  '無効化→再有効化': '同期済みの目印が効かず、再有効化後に全タブがアンミュートのまま残る退行の検出（ADR-0003 / FR-07）',
  アイドル停止: '目印が Service Worker の停止で消え、起動のたびに利用者のアンミュートを取り消す退行の検出（ADR-0003 / FR-05）',
  ミュートし損ねた: '`onCreated` でのミュートが効かなかったタブを、遷移のときに拾えなくなる退行の検出（SPEC-SW-05 / FR-03）',
  'mutedInfo が分からない': '`mutedInfo` が取れないときに何もせず抜け、「たまにミュートされない」状態に戻る退行の検出（SPEC-SW-02）',
  'DEBUG = true': 'デバッグ出力を有効にしたまま配布する事故の検出（SPEC-PKG-02）',
  'src/ に未追跡': 'コミットしていない src/ から zip を作り、提出物と履歴が食い違う事故の検出（SPEC-PKG-02）'
}

const { stdout } = await execFileAsync(
  'npx', ['playwright', 'test', '--list', '--reporter=json'],
  { cwd: root, maxBuffer: 32 * 1024 * 1024 }
)

const report = JSON.parse(stdout)

/** suite を再帰的に辿ってテストを集める */
const collect = (suite, trail = []) => {
  const here = suite.title ? [...trail, suite.title] : trail
  const rows = []
  for (const spec of suite.specs ?? []) {
    rows.push({ group: here.slice(1).join(' › '), title: spec.title, line: spec.line })
  }
  for (const child of suite.suites ?? []) {
    rows.push(...collect(child, here))
  }
  return rows
}

const byFile = new Map()
for (const suite of report.suites ?? []) {
  const file = path.basename(suite.file ?? suite.title ?? '')
  byFile.set(file, collect(suite))
}

const total = [...byFile.values()].reduce((n, rows) => n + rows.length, 0)

// 説明の無いファイルや、どのテストにも一致しない回帰テストのキーワードがあれば止める。
// テスト名を変えたり消したりしたとき、カタログの行が黙って消えるのを防ぐ
const problems = []
for (const file of byFile.keys()) {
  if (!FILE_INFO[file]) problems.push(`FILE_INFO に ${file} の説明がありません`)
}
for (const needle of Object.keys(REGRESSION)) {
  const hit = [...byFile.values()].some((rows) => rows.some((r) => `${r.group} ${r.title}`.includes(needle)))
  if (!hit) problems.push(`REGRESSION のキーワード「${needle}」に一致するテストがありません`)
}
if (problems.length > 0) {
  for (const p of problems) console.error(`❌ ${p}`)
  console.error('   scripts/test-catalog.mjs の FILE_INFO / REGRESSION を実際のテストに合わせてください。')
  process.exit(1)
}

const regressionRows = []
const lines = [
  '# テストカタログ',
  '',
  '> **このファイルは `npm run docs:tests` で自動生成される。手で編集しない。**',
  '> 説明文を変えたい場合は `scripts/test-catalog.mjs` を編集する。',
  '',
  `テスト総数: **${total}**`,
  '',
  'テストの方針・手法は [TESTING.md](TESTING.md) を参照。',
  ''
]

for (const [file, rows] of byFile) {
  const info = FILE_INFO[file]
  lines.push(`## ${info.title}`, '')
  lines.push(`\`tests/${file}\` — ${rows.length} 件`, '')
  if (info.detail) lines.push(info.detail, '')
  lines.push(`対応する仕様: ${info.specs}`, '')
  lines.push('| # | グループ | テスト |', '| --- | --- | --- |')

  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.group || '—'} | ${r.title} |`)
    const haystack = `${r.group} ${r.title}`
    for (const [needle, why] of Object.entries(REGRESSION)) {
      if (haystack.includes(needle)) {
        regressionRows.push({ label: `${r.group} › ${r.title}`, why })
      }
    }
  })
  lines.push('')
}

lines.push('## 回帰テストとして重要なもの', '')
lines.push('壊れたときに気づきにくい問題を固定しているテスト。**消さないこと。**', '')
lines.push('| テスト | 何を守っているか |', '| --- | --- |')
for (const r of regressionRows) {
  lines.push(`| ${r.label} | ${r.why} |`)
}
lines.push('')

lines.push('## 対象外', '')
lines.push('| 対象 | 理由 |', '| --- | --- |')
lines.push('| 実際に音が鳴らないこと | テストは `mutedInfo` を見る。音声の出力そのものは見ない。手動確認 M-1 |')
lines.push('| タブのスピーカーを押す操作そのもの | Playwright・CDP・`chrome://extensions` のどこからも起こせない（2026-10-12 に確認）。押した後の判定は `muteTab` を直接呼んで見ている。手動確認 M-2 |')
lines.push('| ツールバーに描画されたアイコンの見た目 | `setIcon` に渡した画像を記録して見ている。描画結果は見ない。手動確認 M-3 |')
lines.push('| タブを開いてから Service Worker が動き出すまでの間の音声 | 構造的に塞げない（CON-05）。テストもしない |')
lines.push('')
lines.push('これらの確認手順は [MANUAL-CHECKLIST.md](MANUAL-CHECKLIST.md) を参照。')
lines.push('')

const out = path.join(root, 'docs', 'TEST-CATALOG.md')
const content = lines.join('\n')
const rel = path.relative(root, out)

// --check: 生成物が最新か検証するだけ（書き込まない）。npm run check から呼ばれる
if (process.argv.includes('--check')) {
  let existing = null
  try {
    existing = await readFile(out, 'utf8')
  } catch {
    console.error(`❌ ${rel} がありません。'npm run docs:tests' を実行してください。`)
    process.exit(1)
  }
  if (existing !== content) {
    console.error(`❌ ${rel} がテスト定義と食い違っています。`)
    console.error("   テストを増減したら 'npm run docs:tests' で再生成してください。")
    process.exit(1)
  }
  console.log(`✅ ${rel} は最新です (${total} 件)`)
  process.exit(0)
}

await writeFile(out, content, 'utf8')
console.log(`✅ ${rel} を生成しました (${total} 件)`)
