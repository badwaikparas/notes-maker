/**
 * Background Service Worker
 * Handles: tab audio capture, screenshot command, auto-save heartbeat,
 * and message routing between content script ↔ side panel.
 */

// ─── Side Panel Setup ────────────────────────────────────────────────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error)

// ─── Screenshot Command ───────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'take-screenshot') return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return

  try {
    // 1. Capture the visible tab as a PNG data URL
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    })

    // 2. Ask the content script for the current video timestamp
    let videoTime = null
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_VIDEO_TIME',
      })
      videoTime = response?.currentTime ?? null
    } catch (_) {
      // page may not have a video — that's fine
    }

    // 3. Forward screenshot + timestamp to the side panel
    chrome.runtime.sendMessage({
      type: 'SCREENSHOT_TAKEN',
      payload: { imageDataUrl, videoTime, tabUrl: tab.url, tabTitle: tab.title },
    })
  } catch (err) {
    console.error('[NotesMaker] Screenshot failed:', err)
  }
})

// ─── Tab Audio Stream ID ──────────────────────────────────────────────────────
// The side panel asks for a stream ID so it can capture tab audio itself.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_TAB_STREAM_ID') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) {
        sendResponse({ error: 'No active tab' })
        return
      }
      // getMediaStreamId is the MV3-safe way to hand tab audio to another context
      chrome.tabCapture.getMediaStreamId(
        { consumerTabId: tab.id },
        (streamId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message })
          } else {
            sendResponse({ streamId })
          }
        }
      )
    })
    return true // keep channel open for async sendResponse
  }

  // Relay GET_VIDEO_INFO from side panel → content script of active tab
  if (message.type === 'GET_VIDEO_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab) { sendResponse({}); return }
      try {
        const info = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_INFO' })
        sendResponse(info)
      } catch {
        sendResponse({})
      }
    })
    return true
  }

  // Auto-save: side panel sends its serialised state; we persist it
  if (message.type === 'AUTO_SAVE') {
    chrome.storage.local.set({ 'nm_session': message.payload }, () => {
      sendResponse({ ok: true })
    })
    return true
  }

  // Load saved session on demand
  if (message.type === 'LOAD_SESSION') {
    chrome.storage.local.get('nm_session', (result) => {
      sendResponse({ session: result['nm_session'] ?? null })
    })
    return true
  }

  // Clear saved session
  if (message.type === 'CLEAR_SESSION') {
    chrome.storage.local.remove('nm_session', () => sendResponse({ ok: true }))
    return true
  }
})

// ─── Final save when tab closes ──────────────────────────────────────────────
// The side panel itself sends an AUTO_SAVE before unload; this is a safety net.
chrome.tabs.onRemoved.addListener(() => {
  // Nothing extra needed — the side panel's beforeunload handler does the save.
})
