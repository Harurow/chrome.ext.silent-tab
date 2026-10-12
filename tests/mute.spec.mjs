import { test, expect, waitFor, sleep } from './fixtures/extension.mjs'

test.describe('タブのミュート', () => {
  test('インストール時に、開いているタブをミュートする', async ({ ext }) => {
    const tabs = await waitFor(async () => {
      const tabs = await ext.tabs()
      return tabs.length > 0 && tabs.every((t) => t.mutedInfo.muted) && tabs
    })
    expect(tabs).toBeTruthy()
    for (const tab of await ext.tabs()) {
      expect(tab.mutedInfo).toMatchObject({ muted: true, reason: 'extension', extensionId: ext.extensionId })
    }
  })

  test('新しく開いたタブをミュートする', async ({ ext }) => {
    const { id } = await ext.openTab()
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    expect(await ext.mutedInfo(id)).toMatchObject({ muted: true, reason: 'extension' })
  })

  test('ページを遷移してもミュートのままで、アイコンもミュート表示になる', async ({ ext, base }) => {
    await ext.installIconSpy()
    const { page, id } = await ext.openTab(`${base}/a`)
    // 作成時のミュートで呼ばれる setIcon を待ってから消す（後から届くと、遷移で設定し直さなくても 'muted' が残る）
    await waitFor(async () => (await ext.lastIcon(id)) === 'muted')
    await ext.clearIcon(id)
    await page.goto(`${base}/b`)
    // 遷移で setIcon が呼ばれるまで待つ（呼ばれなければ null のまま時間切れになり、下の expect で落ちる）
    await waitFor(async () => (await ext.lastIcon(id)) !== null)
    expect((await ext.mutedInfo(id)).muted).toBe(true)
    expect(await ext.lastIcon(id)).toBe('muted')
  })

  // onCreated でのミュートが効かなかったタブ（mutedInfo が一度も変わっていない）を、遷移のときに拾う（SPEC-SW-05）
  test('作成時にミュートし損ねたタブも、遷移したらミュートする', async ({ ext, base }) => {
    await ext.sw.evaluate(() => {
      globalThis.__update = chrome.tabs.update
      chrome.tabs.update = async () => {}
    })
    const { page, id } = await ext.openTab(`${base}/a`)
    await sleep(300)
    await ext.sw.evaluate(() => { chrome.tabs.update = globalThis.__update })
    const before = await ext.mutedInfo(id)
    expect(before.muted).toBe(false)
    expect(before.reason).toBeUndefined()

    await page.goto(`${base}/b`)
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    expect((await ext.mutedInfo(id)).muted).toBe(true)
  })
})

// muteTab を Service Worker 上で直接呼び、mutedInfo の組み合わせごとの判定を見る（SPEC-SW-02）
test.describe('ミュートの判定', () => {
  // タブのスピーカーでアンミュートすると reason は 'user' になる。この操作は Playwright からも CDP からも
  // 起こせない（2026-10-12 に確認）ので、同じ mutedInfo を渡して直接呼ぶ
  test('タブのスピーカーでアンミュートしたタブ（reason: user）はミュートし直さない', async ({ ext }) => {
    const { id } = await ext.openTab()
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    await ext.setMuted(id, false)
    const result = await ext.sw.evaluate((id) =>
      globalThis.muteTab({ id, mutedInfo: { muted: false, reason: 'user' } }), id)
    expect(result).toBe(false)
    expect((await ext.mutedInfo(id)).muted).toBe(false)
  })

  // 以前は mutedInfo が無いと何もせずに抜けており、「たまにミュートされない」原因になっていた
  test('mutedInfo が分からないタブはミュートする', async ({ ext }) => {
    const { id } = await ext.openTab()
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    await ext.setMuted(id, false)
    const result = await ext.sw.evaluate((id) => globalThis.muteTab({ id }), id)
    expect(result).toBe(true)
    expect((await ext.mutedInfo(id)).muted).toBe(true)
  })
})

test.describe('アイコンでの切り替え', () => {
  test('アイコンを押すとアンミュートし、もう一度押すとミュートに戻る', async ({ ext, base }) => {
    await ext.installIconSpy()
    const { id } = await ext.openTab(`${base}/a`)
    await waitFor(async () => (await ext.mutedInfo(id)).muted)

    await ext.clickAction(id)
    await waitFor(async () => !(await ext.mutedInfo(id)).muted)
    expect(await ext.mutedInfo(id)).toMatchObject({ muted: false, reason: 'extension' })
    await waitFor(async () => (await ext.lastIcon(id)) === 'unmuted')
    expect(await ext.lastIcon(id)).toBe('unmuted')

    await ext.clickAction(id)
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    expect((await ext.mutedInfo(id)).muted).toBe(true)
    await waitFor(async () => (await ext.lastIcon(id)) === 'muted')
    expect(await ext.lastIcon(id)).toBe('muted')
  })

  // ページ遷移で setIcon のタブ固有設定が Chrome にリセットされる。
  // 遷移時にアイコンを設定し直さないと、アンミュートなのにミュート表示（default_icon）に戻る
  test('アイコンでアンミュートしたタブは、遷移してもアンミュートのままで、アイコンもアンミュート表示のまま', async ({ ext, base }) => {
    await ext.installIconSpy()
    const { page, id } = await ext.openTab(`${base}/a`)
    await waitFor(async () => (await ext.mutedInfo(id)).muted)
    await ext.clickAction(id)
    await waitFor(async () => !(await ext.mutedInfo(id)).muted)
    // アンミュートで呼ばれる setIcon を待ってから消す（後から届くと、遷移で設定し直さなくても 'unmuted' が残る）
    await waitFor(async () => (await ext.lastIcon(id)) === 'unmuted')

    await ext.clearIcon(id)
    await page.goto(`${base}/b`)
    await waitFor(async () => (await ext.lastIcon(id)) !== null)
    expect(await ext.mutedInfo(id)).toMatchObject({ muted: false, reason: 'extension' })
    expect(await ext.lastIcon(id)).toBe('unmuted')
  })

  test('アンミュートしたタブを閉じて開き直すと、ミュートに戻る', async ({ ext, base }) => {
    const first = await ext.openTab(`${base}/a`)
    await waitFor(async () => (await ext.mutedInfo(first.id)).muted)
    await ext.clickAction(first.id)
    await waitFor(async () => !(await ext.mutedInfo(first.id)).muted)
    await first.page.close()

    const second = await ext.openTab(`${base}/a`)
    await waitFor(async () => (await ext.mutedInfo(second.id)).muted)
    expect((await ext.mutedInfo(second.id)).muted).toBe(true)
  })
})
