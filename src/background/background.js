/**
 * Background Service Worker
 * Handles: tab audio capture, screenshot command, auto-save heartbeat,
 * and message routing between content script ↔ side panel.
 *
 * Key design: screenshots are saved to chrome.storage.local as a queue so they
 * are never lost even if the side panel is closed when the shortcut fires.
 * The side panel drains this queue on mount and on every SCREENSHOT_TAKEN message.
 */

import { API_VERSION } from '../config/version.js'

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

    const payload = { imageDataUrl, videoTime, tabUrl: tab.url, tabTitle: tab.title }

    // 3. Forward screenshot + timestamp to the side panel (best-effort)
    try {
      chrome.runtime.sendMessage({
        type: 'SCREENSHOT_TAKEN',
        payload,
      })
    } catch (_) {
      // Side panel may be closed — that's OK, we queue it below
    }

    // 4. Always persist to a queue so the side panel can drain it on next open
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      queue.push({ ...payload, capturedAt: Date.now() })
      // Keep at most 50 queued screenshots to avoid exceeding storage quota
      const trimmed = queue.slice(-50)
      chrome.storage.local.set({ 'nm_screenshot_queue': trimmed })
    })
  } catch (err) {
    console.error('[NotesMaker] Screenshot failed:', err)
  }
})

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── API version handshake ─────────────────────────────────────────────────
  // Any context that wants to talk to us should send its API_VERSION.
  // We reject mismatched versions to prevent subtle breakage across upgrades.
  if (message.type === 'CHECK_API_VERSION') {
    const clientVersion = message.version
    if (clientVersion !== API_VERSION) {
      sendResponse({
        ok: false,
        error: `API version mismatch: extension expects v${API_VERSION}, client sent v${clientVersion}. Please reload the extension.`,
        serverVersion: API_VERSION,
      })
    } else {
      sendResponse({ ok: true, serverVersion: API_VERSION })
    }
    return false
  }

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

  // Side panel drains the screenshot queue on mount
  if (message.type === 'DRAIN_SCREENSHOT_QUEUE') {
    chrome.storage.local.get('nm_screenshot_queue', (result) => {
      const queue = result['nm_screenshot_queue'] ?? []
      chrome.storage.local.remove('nm_screenshot_queue', () => {
        sendResponse({ queue })
      })
    })
    return true
  }
})

// ─── Final save when tab closes ──────────────────────────────────────────────
// The side panel itself sends an AUTO_SAVE before unload; this is a safety net.
chrome.tabs.onRemoved.addListener(() => {
  // Nothing extra needed — the side panel's beforeunload handler does the save.
})
