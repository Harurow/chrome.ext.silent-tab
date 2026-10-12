import { test, expect, waitFor, sleep, ExtensionBrowser } from './fixtures/extension.mjs'

const allMuted = (tabs) => tabs.length > 0 && tabs.every((t) => t.mutedInfo.muted)

test.describe('拡張機能の更新・無効化', () => {
  // Chrome は拡張機能のアンロード時に、その拡張機能がミュートしたタブをすべてアンミュートする。
  // 更新時に強制ミュートしないと、全タブがアンミュートのまま残る（ADR-0002）
  test('拡張機能を更新すると、アンミュートしていたタブも含めてミュートし直す', async ({ ext, base }) => {
    const unmuted = await ext.openTab(`${base}/a`)
    const muted = await ext.openTab(`${base}/b`)
    await waitFor(async () => allMuted(await ext.tabs()))
    await ext.clickAction(unmuted.id)
    await waitFor(async () => !(await ext.mutedInfo(unmuted.id)).muted)

    await ext.reload()
    await waitFor(async () => allMuted(await ext.tabs()))
    const tabs = await ext.tabs()
    expect(allMuted(tabs), JSON.stringify(tabs)).toBe(true)
    expect((await ext.mutedInfo(muted.id)).muted).toBe(true)
  })

  // 再有効化では onInstalled も onStartup も発火しない。同期済みの目印で検出する（ADR-0003）
  test('無効化→再有効化すると、アンミュートしていたタブも含めてミュートし直し、遷移してもミュートのまま', async ({ ext, base }) => {
    const unmuted = await ext.openTab(`${base}/a`)
    const other = await ext.openTab(`${base}/b`)
    await waitFor(async () => allMuted(await ext.tabs()))
    await ext.clickAction(unmuted.id)
    await waitFor(async () => !(await ext.mutedInfo(unmuted.id)).muted)

    await ext.disableAndEnable()
    await waitFor(async () => allMuted(await ext.tabs()))
    const tabs = await ext.tabs()
    expect(allMuted(tabs), JSON.stringify(tabs)).toBe(true)

    await other.page.goto(`${base}/c`)
    await waitFor(async () => (await ext.mutedInfo(other.id)).muted)
    expect((await ext.mutedInfo(other.id)).muted).toBe(true)
  })
})

test.describe('ブラウザと Service Worker の再起動', () => {
  test('ブラウザを再起動すると、復元したタブを含めてすべてミュートする', async ({ userDataDir, base }) => {
    const ext = await ExtensionBrowser.launch({ userDataDir, mode: 'cmdline' })
    try {
      for (const p of ['/x', '/y']) await ext.openTab(`${base}${p}`)
      await waitFor(async () => allMuted(await ext.tabs()))
      // 全タブをアンミュートした状態で終了する
      await ext.sw.evaluate(async () => {
        for (const t of await chrome.tabs.query({})) await chrome.tabs.update(t.id, { muted: false })
      })
      const before = await ext.tabs()
      expect(before.every((t) => !t.mutedInfo.muted)).toBe(true)
      await sleep(1000)

      await ext.restart()
      await waitFor(async () => (await ext.tabs()).length >= before.length && allMuted(await ext.tabs()))
      const after = await ext.tabs()
      expect(after.length, '前回のタブが復元されていること').toBeGreaterThanOrEqual(before.length)
      expect(allMuted(after), JSON.stringify(after)).toBe(true)
    } finally {
      await ext.shutdown()
    }
  })

  // 同期済みの目印（グローバルなバッジ背景色）が SW の停止で消えると、
  // SW が起動するたびに全タブを強制ミュートし、ユーザーのアンミュートを取り消してしまう（ADR-0003）
  test('Service Worker がアイドル停止→再起動しても、アンミュートしたタブはアンミュートのまま', async ({ ext, base }) => {
    test.setTimeout(120_000)
    const { id } = await ext.openTab(`${base}/a`)
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    await ext.clickAction(id)
    await waitFor(async () => !(await ext.mutedInfo(id)).muted)
    await ext.sw.evaluate(() => { globalThis.__instance = 'before-idle' })

    // DevTools が接続していると SW は停止しない。切断してアイドル停止（約30秒）を待つ
    await ext.disconnect()
    await sleep(45_000)
    const { wasRunning } = await ext.reconnectAndWake()
    expect(wasRunning, 'Service Worker がアイドル停止していること').toBe(false)
    expect(await ext.sw.evaluate(() => globalThis.__instance ?? null)).toBeNull()

    // 誤って同期すると、起動時の syncAllTabsIfNeeded() がこのタブをミュートする。それが終わるだけの時間を置く
    await sleep(1500)
    expect(await ext.mutedInfo(id)).toMatchObject({ muted: false, reason: 'extension' })
  })
})
