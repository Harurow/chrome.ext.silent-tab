/**
 * コミット承認を記録する（scripts/approve.mjs から呼ぶ。テストからも呼べるよう、チェックの流し方を受け取る）。
 *
 * 全件のチェック（npm run check）を流し、通って、作業ツリー（hash と HEAD）が流す前と同じときだけ承認を書く。
 * チェックの途中で作業ツリーが変わったら、どの状態で通ったか分からないので承認しない
 * （流したあとの作業ツリーで承認すると、テストしていない中身を承認する）。
 * 考え方は chrome.ext.kabu-tantan の scripts/lib/check-record.mjs と同じ。
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { computeChangeHash } from './change-hash.mjs'

export const APPROVAL_FILE = '.claude/review-approved.json'

/**
 * @param {{ root: string, note?: string, runCheckAsync: () => Promise<number>, env?: Record<string, string | undefined> }} options
 * @returns {Promise<{ ok: boolean, reason?: 'extension-path' | 'no-changes' | 'failed' | 'changed', approval?: object }>}
 */
export const approveAsync = async ({ root, note = '', runCheckAsync, env = process.env }) => {
  // EXTENSION_PATH を指定すると、テストは作業ツリーの src/ ではなく指定した拡張機能を読む。src/ を試していないので承認しない
  if (env.EXTENSION_PATH) return { ok: false, reason: 'extension-path' }

  const before = await computeChangeHash(root)
  if (before.files.length === 0) return { ok: false, reason: 'no-changes' }

  const code = await runCheckAsync()
  if (code !== 0) return { ok: false, reason: 'failed' }

  const after = await computeChangeHash(root)
  if (after.hash !== before.hash || after.head !== before.head) return { ok: false, reason: 'changed' }

  const approval = {
    hash: after.hash,
    head: after.head,
    approvedAt: new Date().toISOString(),
    note: note || null,
    files: after.files
  }
  const out = path.join(root, APPROVAL_FILE)
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(approval, null, 2) + '\n', 'utf8')
  return { ok: true, approval }
}
