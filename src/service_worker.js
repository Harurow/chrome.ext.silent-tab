console.log(`Hello, I'm SilentTab Service Worker. start at ${(new Date(Date.now())).toLocaleString()}. id:`, chrome.runtime.id)

function muteTab (tab) {
  if (!tab.mutedInfo.muted) {
    chrome.tabs.update(tab.id, { muted: true })
  }
}

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

chrome.tabs.onCreated.addListener((tab) => {
  muteTab(tab)
})

chrome.tabs.onUpdated.addListener((tabId, _, tab) => {
  chrome.action.setIcon({
    tabId,
    path: actionIcons[tab.mutedInfo.muted === true]
  })
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      muteTab(tab)
    }
  })
})

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.tabs.update(tab.id, {
    muted: !tab.mutedInfo.muted
  })
})
