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

// ユーザーが明示的にアンミュートしたタブIDを保存するキー
// chrome.storage.session を使うことで、Service Worker が停止しても
// ブラウザセッション中は選択が維持される
const UNMUTED_TABS_KEY = 'unmutedTabs'

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
 * storage の read-modify-write を直列化するためのキュー
 * 複数のタブイベントが並行しても更新が失われないようにする
 * @type {Promise<any>}
 */
let storageQueue = Promise.resolve()

/**
 * 処理を直列に実行する
 * @param {() => Promise<any>} task - 実行する処理
 * @returns {Promise<any>}
 */
function serialize (task) {
  const result = storageQueue.then(task)
  storageQueue = result.then(() => {}, () => {})
  return result
}

/**
 * ユーザーが明示的にアンミュートしたタブIDの集合を取得する
 * @returns {Promise<Set<number>>}
 */
async function getUnmutedTabIds () {
  try {
    const stored = await chrome.storage.session.get(UNMUTED_TABS_KEY)
    return new Set(stored[UNMUTED_TABS_KEY] ?? [])
  } catch (ex) {
    console.error('Error reading unmuted tab list:', ex)
    return new Set()
  }
}

/**
 * タブのアンミュート記録を更新する
 * @param {number} tabId - タブID
 * @param {boolean} unmuted - ユーザーがアンミュートを選択したか
 * @returns {Promise<void>}
 */
async function rememberUnmutedTab (tabId, unmuted) {
  if (typeof tabId !== 'number' || tabId === chrome.tabs.TAB_ID_NONE) {
    return
  }

  await serialize(async () => {
    try {
      const ids = await getUnmutedTabIds()
      if (ids.has(tabId) === unmuted) {
        return
      }

      if (unmuted) {
        ids.add(tabId)
      } else {
        ids.delete(tabId)
      }

      await chrome.storage.session.set({ [UNMUTED_TABS_KEY]: [...ids] })
      debugLog('Unmuted tab list updated:', [...ids])
    } catch (ex) {
      console.error('Error updating unmuted tab list:', ex)
    }
  })
}

/**
 * タブをミュート状態にする関数
 * ユーザーが明示的にアンミュートしたタブは対象外とする
 * @param {object} tab - タブオブジェクト
 * @returns {Promise<boolean>} 処理後のミュート状態
 */
async function muteTab (tab) {
  if (!tab || typeof tab.id !== 'number' || tab.id === chrome.tabs.TAB_ID_NONE) {
    return false
  }

  // 既にミュート済みなら何もしない
  // mutedInfo が取得できない場合は念のためミュートを適用する
  if (tab.mutedInfo?.muted === true) {
    return true
  }

  try {
    const unmutedTabIds = await getUnmutedTabIds()
    if (unmutedTabIds.has(tab.id)) {
      debugLog('Skip muting (unmuted by user):', tab.id)
      return false
    }

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

/**
 * すべてのタブをミュートし、アイコンを同期する
 * @returns {Promise<void>}
 */
async function syncAllTabs () {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(tabs.map(async (tab) => {
      const isMuted = await muteTab(tab)
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
  // ページ遷移のたびにミュートし直す
  // （ユーザーがアンミュートを選んだタブは muteTab 側でスキップされる）
  if (changeInfo.status === 'loading') {
    await muteTab(tab)
  }

  // ミュート状態が変化したときだけアイコンを更新する
  if (changeInfo.mutedInfo) {
    const { muted, reason } = changeInfo.mutedInfo
    debugLog('Muted state changed:', changeInfo.mutedInfo)

    // タブのスピーカーアイコンなど、ユーザー自身による操作を記録する
    // 拡張機能による変更は reason が 'extension' になるため対象外
    if (reason === 'user') {
      await rememberUnmutedTab(tabId, !muted)
    }

    await updateTabIcon(tabId, muted)
  }
})

/**
 * タブが閉じられたときのイベントハンドラ
 * アンミュート記録を破棄する
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await rememberUnmutedTab(tabId, false)
})

/**
 * タブが別のタブに置き換えられたときのイベントハンドラ
 * 古いタブIDの記録を新しいタブIDへ引き継ぐ
 */
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const unmutedTabIds = await getUnmutedTabIds()
  if (unmutedTabIds.has(removedTabId)) {
    await rememberUnmutedTab(addedTabId, true)
  }
  await rememberUnmutedTab(removedTabId, false)
})

/**
 * 拡張機能のアイコンがクリックされたときのイベントハンドラ
 */
chrome.action.onClicked.addListener(async (tab) => {
  debugLog('Extension icon clicked for tab:', tab)

  try {
    // タブのミュート状態を切り替える
    const newMutedState = !(tab.mutedInfo?.muted ?? false)
    await chrome.tabs.update(tab.id, { muted: newMutedState })

    // アンミュートを選んだタブは、閉じるまでミュートし直さない
    await rememberUnmutedTab(tab.id, !newMutedState)

    debugLog('Tab mute state toggled:', newMutedState)
  } catch (ex) {
    console.error('Error toggling tab mute state:', ex)
  }
})
