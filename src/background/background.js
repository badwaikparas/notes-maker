/**
 * Background Service Worker
 *
 * The UI runs as an iframe overlay injected by the content script.
 * Extension iframe pages are chrome-extension:// pages, so:
 *   - chrome.runtime.sendMessage  -> reaches background + all extension pages
 *   - chrome.tabs.sendMessage     -> reaches content scripts only
 *   - sender.tab is undefined for messages from extension pages (not content scripts)
 *
 * Screenshot flow: background -> chrome.runtime.sendMessage (broadcast) -> iframe
 * Audio flow:      Toolbar (iframe) -> background -> chrome.tabCapture -> streamId -> Toolbar
 */

import { API_VERSION } from '../config/version.js'

// Screenshot Command (Ctrl+Shift+S)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'take-screenshot') return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return

  try {
    // 1. Hide the overlay so it doesn't appear in the screenshot
    try { await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_FOR_SCREENSHOT' }) } catch (_) {}
    await new Promise((r) => setTimeout(r, 120))

    // 2. Capture the clean tab screenshot
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })

    // 3. Restore overlay
    try { chrome.tabs.sendMessage(tab.id, { type: 'SHOW_AFTER_SCREENSHOT' }) } catch (_) {}

    // 4. Get video time
    let videoTime = null
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_TIME' })
      videoTime = res?.currentTime ?? null
    } catch (_) {}

    const payload = { imageDataUrl, videoTime, tabUrl: tab.url, tabTitle: tab.title, capturedAt: Date.now() }

    // 5. Broadcast to the extension iframe via chrome.runtime (NOT chrome.tabs.sendMessage)
    //    chrome.runtime.sendMessage reaches all open extension pages including iframes.
    try { chrome.runtime.sendMessage({ type: 'SCREENSHOT_TAKEN', payload }) } catch (_) {}

    // 6. Also queue to storage for drain when overlay next opens
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      queue.push(payload)
      chrome.storage.local.set({ 'nm_screenshot_queue': queue.slice(-50) })
    })
  } catch (err) {
    console.error('[NotesMaker] Screenshot failed:', err)
  }
})

// Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // API version check
  if (message.type === 'CHECK_API_VERSION') {
    sendResponse(
      message.version !== API_VERSION
        ? { ok: false, error: `API version mismatch: expects v${API_VERSION}, got v${message.version}.` }
        : { ok: true, serverVersion: API_VERSION }
    )
    return false
  }

  // Tab audio capture via desktopCapture.
  // We pass the active tab as targetTab so Chrome attaches the picker dialog
  // to the correct Chrome window (without this, the dialog may appear off-screen
  // or fail silently when called from a service worker).
  if (message.type === 'REQUEST_TAB_AUDIO_STREAM') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.desktopCapture.chooseDesktopMedia(
        ['tab', 'audio'],
        tab ?? null,     // targetTab — attaches picker to this window
        (streamId) => {
          if (!streamId) {
            // Empty streamId = user closed/cancelled the picker (not a hard error)
            sendResponse({ cancelled: true })
          } else {
            sendResponse({ streamId })
          }
        }
      )
    })
    return true  // async
  }



  // Relay minimize command from iframe back to the host tab's content script
  if (message.type === 'MINIMIZE_OVERLAY') {
    const tabId = sender.tab?.id
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'MINIMIZE_OVERLAY' })
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab) chrome.tabs.sendMessage(tab.id, { type: 'MINIMIZE_OVERLAY' })
      })
    }
    sendResponse({ ok: true })
    return false
  }

  // Persistence helpers
  if (message.type === 'AUTO_SAVE') {
    chrome.storage.local.set({ 'nm_session': message.payload }, () => sendResponse({ ok: true }))
    return true
  }

  if (message.type === 'LOAD_SESSION') {
    chrome.storage.local.get('nm_session', (result) => sendResponse({ session: result['nm_session'] ?? null }))
    return true
  }

  if (message.type === 'CLEAR_SESSION') {
    chrome.storage.local.remove('nm_session', () => sendResponse({ ok: true }))
    return true
  }

  if (message.type === 'DRAIN_SCREENSHOT_QUEUE') {
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      chrome.storage.local.remove('nm_screenshot_queue', () => sendResponse({ queue }))
    })
    return true
  }
})
