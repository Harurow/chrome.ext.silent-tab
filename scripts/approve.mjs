/**
 * コミット承認を記録する。
 *
 *   1. `npm run check`（lint + validate + テスト全件）を実行する
 *   2. 通って、作業ツリーが流す前と同じなら、その変更内容のハッシュを .claude/review-approved.json に書く
 *      （途中で変わったら承認しない。scripts/lib/approval.mjs）
 *
 * .claude/hooks/commit-gate.sh がこのファイルを見て git commit を許可する。
 * 承認はハッシュ（変更をすべてコミットしたときの tree の ID）と HEAD に紐づくので、
 * 承認後に変更すると無効になり、1回コミットすると使い切られる。
 *
 * ⚠️ このスクリプトは「テストが通ったこと」しか保証しない。
 *    reviewer のレビューを通したかどうかは人間/lead の責任。
 */
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { approveAsync } from './lib/approval.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const note = process.argv.slice(2).join(' ').trim()

const runCheckAsync = () => new Promise((resolve) => {
  console.log('▶ npm run check を実行します（lint + validate + テスト全件）\n')
  const child = spawn('npm', ['run', 'check'], { cwd: root, stdio: 'inherit' })
  child.on('close', (code) => resolve(code ?? 1))
})

const result = await approveAsync({ root, note, runCheckAsync })

if (!result.ok) {
  if (result.reason === 'extension-path') {
    console.error('\n❌ EXTENSION_PATH が指定されています。テストが作業ツリーの src/ を試さないので、承認は記録しません。')
    console.error('   EXTENSION_PATH を外して npm run approve を実行してください。')
  } else if (result.reason === 'no-changes') {
    console.error('\n❌ コミット対象の変更がありません。')
  } else if (result.reason === 'failed') {
    console.error('\n❌ npm run check が失敗しました。承認は記録しません。')
    console.error('   修正してから再度 npm run approve を実行してください。')
  } else {
    console.error('\n❌ npm run check の途中で作業ツリーか HEAD が変わりました。どの状態で通ったか分からないので、承認は記録しません。')
    console.error('   変更を終えてから、もう一度 npm run approve を実行してください。')
  }
  process.exit(1)
}

const { approval } = result
console.log('\n✅ 承認を記録しました')
console.log(`   対象: ${approval.files.length} ファイル`)
console.log(`   hash: ${approval.hash.slice(0, 16)}…`)
if (note) console.log(`   note: ${note}`)
console.log('\n   git add -A && git commit が可能になりました（変更はすべてコミットする）。')
console.log('   ⚠️ ここからファイルを変更すると承認は無効になります（再レビューが必要）。')
