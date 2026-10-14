/**
 * 作業ツリーの今の中身を表すハッシュを求める。
 *
 * レビュー承認をこのハッシュに紐づけることで、
 * 「承認後に1文字でも変更したら承認は無効」を機械的に保証する。
 *
 * ハッシュは、作業ツリーの変更をすべて（未追跡のファイルも）コミットしたときにできる tree の ID。
 * 一時的な index に HEAD を読み込み、git add --all して write-tree で求める（本物の index は触らない）。
 * ステージの状態（git add したか・一部だけか）によらず、作業ツリーの中身だけで決まる。
 * 実際にコミットされる中身（index）が作業ツリーと同じかは、コミットゲートが committedTreeAsync で別に確かめる。
 * 求め方は chrome.ext.kabu-tantan・chrome.ext.love-g-rss-reader と同じ。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

/** 承認ファイル自身は対象から外す（書くたびにハッシュが変わってしまうため。.gitignore でも無視している） */
const EXCLUDE = new Set(['.claude/review-approved.json'])

const git = async (args, cwd, env = process.env) => {
  const { stdout } = await execFileAsync('git', args, { cwd, env, maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

/** 一時的な index で fn を実行する。本物の index は触らない */
const withTempIndexAsync = async (fn) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'silent-tab-gate-'))
  try {
    return await fn({ ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * 作業ツリーの中身の tree の ID（変更をすべてコミットしたときの tree）
 * @param {string} repoRoot リポジトリのルート
 * @returns {Promise<string>}
 */
export const worktreeTreeAsync = (repoRoot) => withTempIndexAsync(async (env) => {
  await git(['read-tree', 'HEAD'], repoRoot, env)
  await git(['add', '--all', '--', '.'], repoRoot, env)
  await git(['rm', '--cached', '--quiet', '--ignore-unmatch', '--', ...EXCLUDE], repoRoot, env)
  return (await git(['write-tree'], repoRoot, env)).trim()
})

/**
 * 今 git commit したときにコミットされる中身（index）の tree の ID。本物の index は触らず、コピーで求める
 * @param {string} repoRoot リポジトリのルート
 * @param {{ addAll?: boolean, addTracked?: boolean }} [options]
 *   addAll: 同じコマンドで先に git add -A するとき / addTracked: git commit -a のとき（追跡しているファイルの変更を足す）
 * @returns {Promise<string>} 解決していない衝突があるときなどは例外
 */
export const committedTreeAsync = async (repoRoot, { addAll = false, addTracked = false } = {}) => {
  const indexPath = path.resolve(repoRoot, (await git(['rev-parse', '--git-path', 'index'], repoRoot)).trim())
  return withTempIndexAsync(async (env) => {
    try {
      await copyFile(indexPath, env.GIT_INDEX_FILE)
    } catch {
      // index がまだ無い
      await git(['read-tree', 'HEAD'], repoRoot, env)
    }
    if (addAll) await git(['add', '--all', '--', '.'], repoRoot, env)
    if (addTracked) await git(['add', '--update', '--', '.'], repoRoot, env)
    return (await git(['write-tree'], repoRoot, env)).trim()
  })
}

/**
 * @param {string} repoRoot リポジトリのルート
 * @returns {Promise<{ hash: string, head: string, files: string[] }>} hash: 作業ツリーの中身の tree の ID
 */
export const computeChangeHash = async (repoRoot) => {
  const hash = await worktreeTreeAsync(repoRoot)

  const head = (await git(['rev-parse', 'HEAD'], repoRoot)).trim()

  // 変更のあったファイル一覧（報告用）。-z では名前の変更・複製の次の欄が元の名前なので読み飛ばす
  const entries = (await git(['status', '--porcelain', '-z'], repoRoot)).split('\0')
  const changed = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    if (/[RC]/.test(entry.slice(0, 2))) i++
    const file = entry.slice(3)
    if (!EXCLUDE.has(file)) changed.push(file)
  }

  return { hash, head, files: changed }
}
