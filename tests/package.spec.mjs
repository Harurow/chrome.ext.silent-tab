import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { rootDir } from './fixtures/extension.mjs'

const execFileAsync = promisify(execFile)
const git = (cwd, ...args) => execFileAsync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd })

/**
 * リポジトリを一時ディレクトリに複製し、作業ツリーの src/ とパッケージ作成に関わるファイルを
 * 写してコミットしておく（未コミットの変更を検出する検査があるため、複製側でコミットする）
 */
const cloneRepo = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-tab-pkg-'))
  await execFileAsync('git', ['clone', '-q', rootDir, dir])
  fs.rmSync(path.join(dir, 'src'), { recursive: true, force: true })
  fs.cpSync(path.join(rootDir, 'src'), path.join(dir, 'src'), { recursive: true, filter: (f) => !f.endsWith('.DS_Store') })
  for (const f of ['scripts/package.mjs', 'package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(rootDir, f), path.join(dir, f))
  }
  await git(dir, 'add', '-A')
  await git(dir, 'commit', '-q', '--allow-empty', '-m', 'test')
  return dir
}

const runPackage = (cwd) => execFileAsync('node', ['scripts/package.mjs'], { cwd }).then(
  ({ stdout }) => ({ ok: true, output: stdout }),
  (e) => ({ ok: false, output: `${e.stdout}${e.stderr}` })
)

test.describe('配布用 zip の作成（npm run package）', () => {
  let dir
  test.beforeEach(async () => { dir = await cloneRepo() })
  test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('src/ がコミット済みなら zip を作り、中身はコミットした src/ と一致する', async () => {
    const result = await runPackage(dir)
    expect(result.ok, result.output).toBe(true)
    const version = JSON.parse(fs.readFileSync(path.join(dir, 'src/manifest.json'), 'utf8')).version
    const zip = path.join(dir, 'dist', `silent-tab-${version}.zip`)
    const { stdout: listed } = await execFileAsync('unzip', ['-Z1', zip])
    const zipped = listed.split('\n').filter((f) => f && !f.endsWith('/')).sort()
    const { stdout: tracked } = await execFileAsync('git', ['ls-files', 'src'], { cwd: dir })
    const committed = tracked.split('\n').filter(Boolean).map((f) => f.replace(/^src\//, '')).sort()
    expect(zipped).toEqual(committed)
  })

  test('src/ に未追跡のファイルがあると止まる', async () => {
    fs.writeFileSync(path.join(dir, 'src', 'notes.txt'), 'memo')
    const result = await runPackage(dir)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('未コミットの変更があります')
  })

  test('DEBUG = true のままだと止まる', async () => {
    const sw = path.join(dir, 'src', 'service_worker.js')
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('const DEBUG = false', 'const DEBUG = true'))
    await git(dir, 'commit', '-qam', 'debug')
    const result = await runPackage(dir)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('DEBUG が false ではありません')
  })

  test('manifest.json だけバージョンを上げると止まる', async () => {
    const manifestPath = path.join(dir, 'src', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.version = '99.0.0'
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    await git(dir, 'commit', '-qam', 'version')
    const result = await runPackage(dir)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('バージョンが一致しません')
  })
})
