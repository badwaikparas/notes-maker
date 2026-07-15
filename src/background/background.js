/**
 * Background Service Worker
 *
 * Architecture: the UI runs as an iframe overlay injected by the content script.
 * The UI page is a chrome-extension:// page so it receives chrome.runtime messages,
 * NOT chrome.tabs.sendMessage (that goes to content scripts only).
 *
 * Screenshot delivery: background → chrome.runtime.sendMessage (broadcast to all
 * extension pages, including the iframe) AND stored in queue for drain on open.
 *
 * Audio capture: uses chrome.tabCapture.getMediaStreamId so there's no picker dialog
 * and the current tab IS capturable.
 */

import { API_VERSION } from '../config/version.js'

// ─── Screenshot Command ───────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'take-screenshot') return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return

  try {
    // 1. Ask content script to temporarily HIDE the overlay so it doesn't
    //    appear in the screenshot. Content script hides, we wait, then capture.
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_FOR_SCREENSHOT' })
    } catch (_) {}

    // Small delay for the DOM to repaint without the overlay
    await new Promise((r) => setTimeout(r, 120))

    // 2. Capture the visible tab (now without the overlay)
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })

    // 3. Restore overlay immediately after capture
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_AFTER_SCREENSHOT' })
    } catch (_) {}

    // 4. Get video time from content script
    let videoTime = null
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_TIME' })
      videoTime = res?.currentTime ?? null
    } catch (_) {}

    const payload = { imageDataUrl, videoTime, tabUrl: tab.url, tabTitle: tab.title, capturedAt: Date.now() }

    // 5. Broadcast to the extension iframe (chrome.runtime reaches all extension pages)
    try {
      chrome.runtime.sendMessage({ type: 'SCREENSHOT_TAKEN', payload })
    } catch (_) {}

    // 6. Also persist to queue (for when overlay isn't open yet)
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      queue.push(payload)
      chrome.storage.local.set({ 'nm_screenshot_queue': queue.slice(-50) })
    })
  } catch (err) {
    console.error('[NotesMaker] Screenshot failed:', err)
  }
})

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── API version ────────────────────────────────────────────────────────────
  if (message.type === 'CHECK_API_VERSION') {
    sendResponse(
      message.version !== API_VERSION
        ? { ok: false, error: `API version mismatch: extension expects v${API_VERSION}, got v${message.version}.`, serverVersion: API_VERSION }
        : { ok: true, serverVersion: API_VERSION }
    )
    return false
  }

  // ── Tab audio capture via tabCapture (no picker dialog, captures current tab) ──
  // The iframe sends this; sender.tab.id IS the tab we want to capture.
  if (message.type === 'REQUEST_TAB_AUDIO_STREAM') {
    const tabId = sender.tab?.id
    if (!tabId) { sendResponse({ error: 'Cannot determine tab ID. Make sure the extension is running as a page overlay.' }); return false }

    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId, consumerTabId: tabId },
      (streamId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message })
        } else {
          sendResponse({ streamId })
        }
      }
    )
    return true // async
  }

  // ── Minimize overlay relay ─────────────────────────────────────────────────
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

  // ── Persistence ────────────────────────────────────────────────────────────
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
