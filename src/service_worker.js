const actionIcons = {
  true: {
    16: 'images/muted16.png',
    24: 'images/muted24.png',
    32: 'images/muted32.png'
  },
  false: {
    16: 'images/unmuted16.png',
    24: 'images/unmuted24.png',
    32: 'images/unmuted32.png'
  }
}

// デバッグモード（本番環境ではfalseに設定）
const DEBUG = false

/**
 * デバッグログを出力する関数
 * @param {string} message - ログメッセージ
 * @param {any} data - 追加データ（オプション）
 */
function debugLog (message, data) {
  if (DEBUG) {
    if (data !== undefined) {
      console.log(message, data)
    } else {
      console.log(message)
    }
  }
}

// 起動メッセージ
debugLog(`SilentTab Service Worker started at ${new Date().toLocaleString()}. Extension ID:`, chrome.runtime.id)

/**
 * タブをミュート状態にする関数
 *
 * ユーザーが意図的にアンミュートしたタブは対象外とする。
 * この判定には tab.mutedInfo.reason を使う。reason は「最後にミュート状態を
 * 変更した理由」で、一度も変更されていないタブでは未設定になる。
 * この拡張機能は自動的にアンミュートすることはないため、
 * 「アンミュート状態かつ reason あり」は誰かが意図的にアンミュートしたことを意味する。
 *
 * @param {object} tab - タブオブジェクト
 * @param {boolean} [force] - アンミュートの意思を無視して強制的にミュートする
 * @returns {Promise<boolean>} 処理後のミュート状態
 */
async function muteTab (tab, force = false) {
  if (!tab || typeof tab.id !== 'number' || tab.id === chrome.tabs.TAB_ID_NONE) {
    return false
  }

  // 既にミュート済みなら何もしない
  // mutedInfo が取得できない場合は念のためミュートを適用する
  if (tab.mutedInfo?.muted === true) {
    return true
  }

  // 意図的にアンミュートされたタブは尊重する
  // （新規タブは reason が未設定なのでミュート対象になる）
  if (!force && tab.mutedInfo?.reason) {
    debugLog('Skip muting (unmuted intentionally):', tab.id)
    return false
  }

  try {
    // muted: true の指定は冪等なため、現在の状態を問わず適用する
    await chrome.tabs.update(tab.id, { muted: true })
    debugLog('Tab muted:', tab.id)
    return true
  } catch (ex) {
    console.error('Error muting tab:', ex)
    return tab.mutedInfo?.muted === true
  }
}

/**
 * タブのアイコンを更新する関数
 * @param {number} tabId - タブID
 * @param {boolean} isMuted - ミュート状態
 * @returns {Promise<void>}
 */
async function updateTabIcon (tabId, isMuted) {
  try {
    await chrome.action.setIcon({
      tabId,
      path: actionIcons[!!isMuted]
    })
    debugLog('Icon updated for tab:', tabId)
  } catch (ex) {
    console.error('Error updating tab icon:', ex)
  }
}

// 全タブを同期済みであることを示す目印（グローバルなバッジ背景色）
// グローバルな action の状態は Service Worker の停止・再起動では保持され、
// 拡張機能のアンロード（無効化・更新）でリセットされる。
// バッジのテキストは設定しないので、背景色を変えても表示には影響しない
const SYNCED_MARKER_COLOR = [1, 2, 3, 255]

/**
 * すべてのタブを強制的にミュートし、アイコンを同期する
 *
 * ブラウザ起動時やインストール時に呼ばれる。復元されたタブが
 * 前回セッションの reason を保持している可能性があるため、強制的にミュートする。
 *
 * @returns {Promise<void>}
 */
async function syncAllTabs () {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: SYNCED_MARKER_COLOR })
    const tabs = await chrome.tabs.query({})
    await Promise.all(tabs.map(async (tab) => {
      const isMuted = await muteTab(tab, true)
      if (typeof tab.id === 'number' && tab.id !== chrome.tabs.TAB_ID_NONE) {
        await updateTabIcon(tab.id, isMuted)
      }
    }))
    debugLog('All tabs synced:', tabs.length)
  } catch (ex) {
    console.error('Error syncing tabs:', ex)
  }
}

/**
 * 拡張機能の読み込み後にまだ同期していなければ、すべてのタブを同期する
 *
 * 無効化→再有効化では onInstalled も onStartup も発火しない。一方で Chrome は
 * 無効化時に、この拡張機能がミュートしたタブをすべてアンミュートする。
 * そのときの mutedInfo は「アイコンでアンミュート」と区別できないため、
 * Service Worker の起動ごとに目印を確認し、無ければ同期する。
 *
 * @returns {Promise<void>}
 */
async function syncAllTabsIfNeeded () {
  let color
  try {
    color = await chrome.action.getBadgeBackgroundColor({})
  } catch (ex) {
    // 判定できないときは同期しない（起動のたびにアンミュートを取り消さないため）
    console.error('Error reading sync marker:', ex)
    return
  }
  if (SYNCED_MARKER_COLOR.every((value, i) => color[i] === value)) {
    return
  }
  debugLog('Sync marker not found')
  await syncAllTabs()
}

/**
 * 拡張機能がインストール/更新されたときのイベントハンドラ
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  debugLog('Extension installed/updated:', details)
  await syncAllTabs()
})

/**
 * ブラウザ起動時のイベントハンドラ
 * セッション復元されたタブを処理する
 */
chrome.runtime.onStartup.addListener(async () => {
  debugLog('Browser started')
  await syncAllTabs()
})

/**
 * タブが作成されたときのイベントハンドラ
 */
chrome.tabs.onCreated.addListener(async (tab) => {
  debugLog('Tab created:', tab)
  await muteTab(tab)
})

/**
 * タブが更新されたときのイベントハンドラ
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  let isMuted = tab.mutedInfo?.muted

  // ページ遷移のたびにミュートし直す
  // （意図的にアンミュートされたタブは muteTab 側でスキップされる）
  if (changeInfo.status === 'loading') {
    isMuted = await muteTab(tab)
  }

  if (changeInfo.mutedInfo) {
    debugLog('Muted state changed:', changeInfo.mutedInfo)
    isMuted = changeInfo.mutedInfo.muted
  }

  // ページ遷移すると action のタブ固有設定（setIcon）が Chrome によって
  // リセットされ、manifest の default_icon に戻ってしまう。
  // そのため status の変化時にもアイコンを設定し直す必要がある
  if (changeInfo.status || changeInfo.mutedInfo) {
    await updateTabIcon(tabId, isMuted)
  }
})

/**
 * 拡張機能のアイコンがクリックされたときのイベントハンドラ
 */
chrome.action.onClicked.addListener(async (tab) => {
  debugLog('Extension icon clicked for tab:', tab)

  try {
    // タブのミュート状態を切り替える
    // アンミュートすると mutedInfo.reason が設定され、
    // 以降 muteTab がこのタブをスキップするようになる
    const newMutedState = !(tab.mutedInfo?.muted ?? false)
    await chrome.tabs.update(tab.id, { muted: newMutedState })
    debugLog('Tab mute state toggled:', newMutedState)
  } catch (ex) {
    console.error('Error toggling tab mute state:', ex)
  }
})

// Service Worker の起動時（無効化→再有効化を含む）に同期漏れがないか確認する
syncAllTabsIfNeeded()
