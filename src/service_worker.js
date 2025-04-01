// アイコン定義（ファイルの先頭に移動）
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
debugLog(`SilentTab Service Worker started at ${(new Date(Date.now())).toLocaleString()}. Extension ID:`, chrome.runtime.id)

/**
 * タブをミュート状態にする関数
 * @param {object} tab - タブオブジェクト
 * @returns {Promise<void>}
 */
async function muteTab (tab) {
  try {
    // タブが既にミュート状態でなければミュートにする
    if (tab && tab.mutedInfo && !tab.mutedInfo.muted) {
      await chrome.tabs.update(tab.id, { muted: true })
      debugLog('Tab muted:', tab.id)
    }
  } catch (ex) {
    console.error('Error muting tab:', ex)
  }
}

/**
 * タブのアイコンを更新する関数
 * @param {number} tabId - タブID
 * @param {boolean} isMuted - ミュート状態
 */
async function updateTabIcon (tabId, isMuted) {
  try {
    await chrome.action.setIcon({
      tabId,
      path: actionIcons[isMuted === true]
    })
    debugLog('Icon updated for tab:', tabId)
  } catch (ex) {
    console.error('Error updating tab icon:', ex)
  }
}

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
chrome.tabs.onUpdated.addListener(async (tabId, _, tab) => {
  debugLog('Tab updated:', tab)

  if (tab && tab.mutedInfo) {
    await updateTabIcon(tabId, tab.mutedInfo.muted)
  }
})

/**
 * 拡張機能がインストール/更新されたときのイベントハンドラ
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  debugLog('Extension installed/updated:', details)

  try {
    // すべてのタブを取得してミュート状態にする
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      await muteTab(tab)
    }
    debugLog('All tabs processed on install')
  } catch (ex) {
    console.error('Error processing tabs on install:', ex)
  }
})

/**
 * 拡張機能のアイコンがクリックされたときのイベントハンドラ
 */
chrome.action.onClicked.addListener(async (tab) => {
  debugLog('Extension icon clicked for tab:', tab)

  try {
    // タブのミュート状態を切り替える
    const newMutedState = !tab.mutedInfo.muted
    await chrome.tabs.update(tab.id, { muted: newMutedState })
    debugLog('Tab mute state toggled:', newMutedState)
  } catch (ex) {
    console.error('Error toggling tab mute state:', ex)
  }
})
