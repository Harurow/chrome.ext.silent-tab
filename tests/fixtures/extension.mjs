import { test as base, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const rootDir = path.dirname(testsDir)

// 既定は src/ をそのまま読み込む。
// EXTENSION_PATH を指定すると別ディレクトリ（例: npm run package で作った zip の展開先）を対象にできる
export const extensionPath = process.env.EXTENSION_PATH
  ? path.resolve(process.env.EXTENSION_PATH)
  : path.join(rootDir, 'src')

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** fn が truthy を返すまで待つ。時間切れのときは最後の値を返す（失敗の判定は呼び出し側の expect に任せる） */
export const waitFor = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout
  let value
  while (Date.now() < end) {
    value = await fn()
    if (value) return value
    await sleep(50)
  }
  return value
}

/**
 * 拡張機能を読み込んだ Chromium を1つ操作する。
 *
 * Playwright の `--load-extension` で読み込むと、再読み込み（更新）で拡張機能が消えてしまう。
 * そのため Chromium を直接起動して CDP の `Extensions.loadUnpacked` で読み込む（mode: 'cdp'）。
 * CDP で読み込んだ拡張機能はブラウザの再起動後に残らないので、
 * 再起動を検証するときだけ `--load-extension` で起動する（mode: 'cmdline'）。
 */
export class ExtensionBrowser {
  constructor ({ userDataDir, mode }) {
    this.userDataDir = userDataDir
    this.mode = mode
    this.extensionId = null
    // タブ ID → CDP の tab ターゲット ID（アイコンを押す操作に要る）
    this.tabTargets = new Map()
  }

  static async launch ({ userDataDir, mode = 'cdp' }) {
    const b = new ExtensionBrowser({ userDataDir, mode })
    await b.start()
    if (mode === 'cdp') {
      const { id } = await b.cdp.send('Extensions.loadUnpacked', { path: extensionPath })
      b.extensionId = id
    }
    b.sw = await b.waitForWorker()
    b.extensionId = new URL(b.sw.url()).host
    return b
  }

  async start () {
    const portFile = path.join(this.userDataDir, 'DevToolsActivePort')
    fs.rmSync(portFile, { force: true })
    const args = [
      '--headless=new',
      `--user-data-dir=${this.userDataDir}`,
      '--remote-debugging-port=0',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      '--restore-last-session'
    ]
    if (this.mode === 'cmdline') {
      args.push(`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`)
    }
    this.proc = spawn(chromium.executablePath(), args, { stdio: 'ignore' })
    const port = await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n')[0], 15000)
    if (!port) throw new Error('Chromium の起動を確認できませんでした')
    this.endpoint = `http://127.0.0.1:${port}`
    await this.connect()
  }

  async connect () {
    this.browser = await chromium.connectOverCDP(this.endpoint)
    this.context = this.browser.contexts()[0]
    this.cdp = await this.browser.newBrowserCDPSession()
  }

  /** この拡張機能の Service Worker か（Chromium 内蔵の拡張機能の Worker を除く） */
  isOurs (worker) {
    return this.extensionId
      ? worker.url() === `chrome-extension://${this.extensionId}/service_worker.js`
      : worker.url().endsWith('/service_worker.js')
  }

  async waitForWorker (exclude = null) {
    const match = (w) => this.isOurs(w) && w !== exclude
    return this.context.serviceWorkers().find(match) ??
      await this.context.waitForEvent('serviceworker', { predicate: match, timeout: 15000 })
  }

  /** 拡張機能の更新（chrome://extensions の再読み込みボタン相当。onInstalled の reason は 'update'） */
  async reload () {
    const next = this.waitForWorker(this.sw)
    await this.cdp.send('Extensions.loadUnpacked', { path: extensionPath })
    this.sw = await next
  }

  /** chrome://extensions の WebUI から無効化→有効化する（onInstalled も onStartup も発火しない） */
  async disableAndEnable () {
    const page = await this.context.newPage()
    await page.goto('chrome://extensions/')
    await page.evaluate((id) => chrome.management.setEnabled(id, false), this.extensionId)
    await sleep(500)
    const next = this.waitForWorker(this.sw)
    await page.evaluate((id) => chrome.management.setEnabled(id, true), this.extensionId)
    await page.close()
    this.sw = await next
  }

  /** ツールバーのアイコンを押す（action.onClicked を発火させる） */
  async clickAction (tabId) {
    const targetId = this.tabTargets.get(tabId)
    if (!targetId) throw new Error(`タブ ${tabId} の tab ターゲットが分かりません（openTab で開いたタブだけ押せる）`)
    await this.cdp.send('Extensions.triggerAction', { id: this.extensionId, targetId })
  }

  /**
   * 新しいタブを開き、そのタブ ID を返す。
   * tabs 権限が無いので URL では突き合わせられない。開く前後のタブ ID の差分で特定する
   */
  async openTab (url) {
    const before = new Set((await this.tabs()).map((t) => t.id))
    const targetsBefore = await this.tabTargetIds()
    const page = await this.context.newPage()
    const id = (await waitFor(async () => (await this.tabs()).find((t) => !before.has(t.id))))?.id
    const targetId = (await this.tabTargetIds()).find((t) => !targetsBefore.includes(t))
    this.tabTargets.set(id, targetId)
    if (url) await page.goto(url)
    return { page, id }
  }

  async tabTargetIds () {
    const { targetInfos } = await this.cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
    return targetInfos.map((t) => t.targetId)
  }

  // ---- Service Worker 内で chrome.tabs を直接使う（tabs 権限が無くても mutedInfo は読める） ----

  tabs () {
    return this.sw.evaluate(async () =>
      (await chrome.tabs.query({})).map((t) => ({ id: t.id, mutedInfo: t.mutedInfo })))
  }

  mutedInfo (tabId) {
    return this.sw.evaluate(async (id) => (await chrome.tabs.get(id)).mutedInfo, tabId)
  }

  setMuted (tabId, muted) {
    return this.sw.evaluate(async ([id, muted]) => { await chrome.tabs.update(id, { muted }) }, [tabId, muted])
  }

  /** chrome.action.setIcon を横取りし、タブごとに最後に設定したアイコン（'muted' / 'unmuted'）を記録する */
  installIconSpy () {
    return this.sw.evaluate(() => {
      const icons = globalThis.__icons = {}
      const setIcon = chrome.action.setIcon.bind(chrome.action)
      chrome.action.setIcon = (details) => {
        icons[details.tabId] = details.path[16].includes('unmuted') ? 'unmuted' : 'muted'
        return setIcon(details)
      }
    })
  }

  lastIcon (tabId) {
    return this.sw.evaluate((id) => globalThis.__icons[id] ?? null, tabId)
  }

  clearIcon (tabId) {
    return this.sw.evaluate((id) => { delete globalThis.__icons[id] }, tabId)
  }

  // ---- ブラウザの終了・再起動 ----

  /** DevTools の接続を切る。接続中は Service Worker がアイドル停止しないため */
  async disconnect () {
    await this.browser.close() // connectOverCDP の場合は切断のみ
  }

  /** 再接続して、この拡張機能の Service Worker を起こす（新しいタブを開いて onCreated を発火させる） */
  async reconnectAndWake () {
    await this.connect()
    const wasRunning = this.context.serviceWorkers().some((w) => this.isOurs(w))
    const next = this.waitForWorker()
    await this.context.newPage()
    this.sw = await next
    return { wasRunning }
  }

  /** 正常終了させてから、同じプロファイルで起動し直す（セッション復元あり） */
  async restart () {
    await this.shutdown()
    await this.start()
    this.sw = await this.waitForWorker()
  }

  async shutdown () {
    if (!this.proc || this.proc.exitCode !== null) return
    const exited = new Promise((resolve) => this.proc.once('exit', resolve))
    await this.cdp.send('Browser.close').catch(() => {})
    await Promise.race([exited, sleep(5000)])
    this.proc.kill()
  }
}

/**
 * テスト用の HTTP サーバ。パスごとに別のページを返す（遷移を起こすため）
 */
const startServer = async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>${req.url}</title>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

export const test = base.extend({
  // 遷移先のページを返すサーバ
  base: async ({}, use) => {
    const { server, base } = await startServer()
    await use(base)
    server.close()
  },

  // テストごとに使い捨てのプロファイルで Chromium を起動し、拡張機能を CDP で読み込む
  ext: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-tab-'))
    const ext = await ExtensionBrowser.launch({ userDataDir })
    try {
      await use(ext)
    } finally {
      await ext.shutdown()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  },

  // 使い捨てのプロファイルのパスだけを渡す（起動方法をテスト側で選ぶとき）
  userDataDir: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-tab-'))
    await use(userDataDir)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

export { expect } from '@playwright/test'
