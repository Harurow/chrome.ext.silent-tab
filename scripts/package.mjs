/**
 * Chrome ウェブストア提出用の zip を dist/ に作成する。
 * src/ をそのまま固めるだけ（ビルドステップは無い）。
 */
import { readFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')
const distDir = path.join(root, 'dist')

const manifest = JSON.parse(await readFile(path.join(srcDir, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const serviceWorker = await readFile(path.join(srcDir, 'service_worker.js'), 'utf8')

// 提出物がコミット済みの内容と一致するよう、src/ に未コミットの変更や未追跡ファイルがあれば中止する
const { stdout: status } = await execFileAsync('git', ['status', '--porcelain', '--', 'src'], { cwd: root })
if (status.trim()) {
  throw new Error(`src/ に未コミットの変更があります。コミットしてから実行してください:\n${status}`)
}

if (!/^const DEBUG = false$/m.test(serviceWorker)) {
  throw new Error('service_worker.js の DEBUG が false ではありません')
}

const versions = {
  'src/manifest.json': manifest.version,
  'package.json': pkg.version,
  'package-lock.json': lock.version,
  'package-lock.json (packages[""])': lock.packages?.['']?.version
}
if (new Set(Object.values(versions)).size !== 1 || !manifest.version) {
  throw new Error(`バージョンが一致しません: ${JSON.stringify(versions)}`)
}

const zipName = `silent-tab-${manifest.version}.zip`
const zipPath = path.join(distDir, zipName)

await mkdir(distDir, { recursive: true })
await rm(zipPath, { force: true })

// -r 再帰 / -X 拡張属性を含めない / -x 除外パターン
await execFileAsync('zip', [
  '-r', '-X', zipPath, '.',
  '-x', '*.DS_Store', '-x', '__MACOSX/*'
], { cwd: srcDir })

const { stdout } = await execFileAsync('unzip', ['-l', zipPath])
const entries = stdout.trim().split('\n').length - 5

console.log(`✅ ${path.relative(root, zipPath)} を作成しました (${entries} ファイル)`)
