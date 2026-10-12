/**
 * manifest.json の構造を検証する。
 * ビルドが無い拡張なので、参照先ファイルの実在と権限ゼロの維持を CI の代わりの安全網にする。
 */
import { readFile, readdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')

const errors = []
const fail = (msg) => errors.push(msg)

/** src/ からの相対パス（先頭 / は src ルート扱い）で実在確認する */
const exists = async (ref) => {
  try {
    await access(path.join(srcDir, ref.replace(/^\//, '')))
    return true
  } catch {
    return false
  }
}

const manifest = JSON.parse(await readFile(path.join(srcDir, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))

// --- 必須フィールド（SPEC-MF-01） ---
if (manifest.manifest_version !== 3) {
  fail(`manifest_version は 3 である必要があります (現在: ${manifest.manifest_version})`)
}

for (const key of ['name', 'version', 'description', 'default_locale', 'icons', 'action', 'background']) {
  if (!manifest[key]) {
    fail(`必須フィールドが欠けています: ${key}`)
  }
}

// --- バージョン（SPEC-MF-02） ---
// Chrome が受け付けるのは、ドット区切りの 1〜4 個の整数（0〜65535、先頭ゼロなし）
const versionParts = String(manifest.version ?? '').split('.')
if (versionParts.length > 4 || !versionParts.every((p) => /^(0|[1-9]\d*)$/.test(p) && Number(p) <= 65535)) {
  fail(`version の形式が不正です: ${manifest.version}`)
}
if (manifest.version !== pkg.version) {
  fail(`version 不一致: manifest.json=${manifest.version} / package.json=${pkg.version}`)
}

// package.json を手で書き換えると lock が追随しないため、ここで検出する
const lockSyncHint = '\n   → package.json を正として `npm install --package-lock-only` で package-lock.json を同期する'
let lock = null
try {
  lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
} catch (e) {
  fail(`package-lock.json を読めません: ${e.code ?? e.message}${lockSyncHint}`)
}
if (lock) {
  if (lock.version !== pkg.version) {
    fail(`version 不一致: package-lock.json の version=${lock.version} / package.json=${pkg.version}${lockSyncHint}`)
  }
  if (lock.packages?.['']?.version !== pkg.version) {
    fail(`version 不一致: package-lock.json の packages[""].version=${lock.packages?.['']?.version} / package.json=${pkg.version}${lockSyncHint}`)
  }
}

// --- 権限（SPEC-MF-03 / NFR-01） ---
// インストール時に権限の警告を出さないことが製品の前提。宣言そのものを禁じる
for (const key of ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions']) {
  if (manifest[key] !== undefined && !(Array.isArray(manifest[key]) && manifest[key].length === 0)) {
    fail(`${key} を宣言しています: ${JSON.stringify(manifest[key])}（NFR-01。権限を足す前に別の手段を探す）`)
  }
}
// 空配列でもキー自体を置かない。content_scripts はサイトへのアクセス権の警告を伴い、
// web_accessible_resources は Web ページに拡張機能の存在を見抜かれる手がかりになる
for (const key of ['content_scripts', 'web_accessible_resources']) {
  if (manifest[key] !== undefined) {
    fail(`${key} を宣言しています（SPEC-MF-03。キー自体を置かない）`)
  }
}

// --- アイコン（SPEC-MF-04） ---
for (const [size, ref] of Object.entries(manifest.icons ?? {})) {
  if (!await exists(ref)) {
    fail(`icons[${size}] のファイルが存在しません: ${ref}`)
  }
}
const defaultIcon = manifest.action?.default_icon
for (const [size, ref] of Object.entries(typeof defaultIcon === 'string' ? { any: defaultIcon } : defaultIcon ?? {})) {
  if (!await exists(ref)) {
    fail(`action.default_icon[${size}] のファイルが存在しません: ${ref}`)
  }
}

// --- Service Worker（SPEC-MF-05） ---
const sw = manifest.background?.service_worker
if (!sw) {
  fail('background.service_worker が定義されていません')
} else if (!await exists(sw)) {
  fail(`service_worker のファイルが存在しません: ${sw}`)
} else {
  // setIcon で切り替えるアイコンは manifest ではなく service_worker.js に書いてある（SPEC-SW-07）
  const code = await readFile(path.join(srcDir, sw), 'utf8')
  const refs = code.match(/'images\/[^']+\.png'/g) ?? []
  if (refs.length === 0) {
    fail(`${sw} からアイコンの参照を見つけられません（'images/*.png' の形で書く）`)
  }
  for (const ref of new Set(refs.map((r) => r.slice(1, -1)))) {
    if (!await exists(ref)) {
      fail(`${sw} が参照するアイコンが存在しません: ${ref}`)
    }
  }
}

// --- ロケール（SPEC-MF-06） ---
const usedKeys = [...new Set((JSON.stringify(manifest).match(/__MSG_(\w+)__/g) ?? []).map((t) => t.slice(6, -2)))]
const locales = (await readdir(path.join(srcDir, '_locales'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
if (manifest.default_locale && !locales.includes(manifest.default_locale)) {
  fail(`default_locale のディレクトリが存在しません: _locales/${manifest.default_locale}`)
}
for (const locale of locales) {
  const messagesPath = `_locales/${locale}/messages.json`
  let messages
  try {
    messages = JSON.parse(await readFile(path.join(srcDir, messagesPath), 'utf8'))
  } catch (e) {
    fail(`${messagesPath} を読めません: ${e.code ?? e.message}`)
    continue
  }
  for (const key of usedKeys) {
    if (!messages[key]?.message) {
      fail(`${messagesPath} に未定義のメッセージキー: ${key}`)
    }
  }
}

// --- 出力 ---
if (errors.length > 0) {
  for (const e of errors) {
    console.error(`❌ ${e}`)
  }
  console.error(`\nmanifest 検証に失敗しました (${errors.length} 件)`)
  process.exit(1)
}

console.log(`✅ manifest 検証 OK (v${manifest.version} / 権限なし / ロケール: ${locales.join(', ')})`)
