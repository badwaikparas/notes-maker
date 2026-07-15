/**
 * Background Service Worker
 *
 * Key responsibilities:
 *  - Handle screenshot command (Ctrl+Shift+S)
 *  - Queue screenshots for delivery when the overlay may not be ready
 *  - Route messages between content script / overlay iframe and the extension
 *  - API version checks
 *  - Auto-save support
 *
 * Architecture note: the UI now runs as an iframe overlay injected by the
 * content script, NOT inside the Chrome side panel. This means the UI
 * stays alive as long as the page is open — closing the Chrome sidebar
 * has no effect.
 */

import { API_VERSION } from '../config/version.js'

// ─── Screenshot Command ───────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'take-screenshot') return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return

  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })

    // Ask content script for current video time
    let videoTime = null
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_TIME' })
      videoTime = res?.currentTime ?? null
    } catch (_) {}

    const payload = { imageDataUrl, videoTime, tabUrl: tab.url, tabTitle: tab.title }

    // Send directly to the overlay (via content-script → iframe postMessage relay)
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'SCREENSHOT_TAKEN', payload })
    } catch (_) {}

    // Also persist to queue so the overlay can drain it on next open
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      queue.push({ ...payload, capturedAt: Date.now() })
      chrome.storage.local.set({ 'nm_screenshot_queue': queue.slice(-50) })
    })
  } catch (err) {
    console.error('[NotesMaker] Screenshot failed:', err)
  }
})

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // API version handshake
  if (message.type === 'CHECK_API_VERSION') {
    if (message.version !== API_VERSION) {
      sendResponse({
        ok: false,
        error: `API version mismatch: extension expects v${API_VERSION}, got v${message.version}. Please reload.`,
        serverVersion: API_VERSION,
      })
    } else {
      sendResponse({ ok: true, serverVersion: API_VERSION })
    }
    return false
  }

  // Tab stream ID for audio capture
  if (message.type === 'REQUEST_TAB_STREAM_ID') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { sendResponse({ error: 'No active tab' }); return }
      chrome.tabCapture.getMediaStreamId({ consumerTabId: tab.id }, (streamId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message })
        } else {
          sendResponse({ streamId })
        }
      })
    })
    return true
  }

  // Auto-save
  if (message.type === 'AUTO_SAVE') {
    chrome.storage.local.set({ 'nm_session': message.payload }, () => sendResponse({ ok: true }))
    return true
  }

  // Load saved session
  if (message.type === 'LOAD_SESSION') {
    chrome.storage.local.get('nm_session', (result) => sendResponse({ session: result['nm_session'] ?? null }))
    return true
  }

  // Clear session
  if (message.type === 'CLEAR_SESSION') {
    chrome.storage.local.remove('nm_session', () => sendResponse({ ok: true }))
    return true
  }

  // Drain screenshot queue
  if (message.type === 'DRAIN_SCREENSHOT_QUEUE') {
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      chrome.storage.local.remove('nm_screenshot_queue', () => sendResponse({ queue }))
    })
    return true
  }

  // Minimize overlay — relayed from the iframe to the content script of its host tab
  if (message.type === 'MINIMIZE_OVERLAY') {
    const tabId = sender.tab?.id
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'MINIMIZE_OVERLAY' })
    } else {
      // Fallback: try active tab
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab) chrome.tabs.sendMessage(tab.id, { type: 'MINIMIZE_OVERLAY' })
      })
    }
    sendResponse({ ok: true })
    return false
  }
})

