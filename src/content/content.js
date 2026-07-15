/**
 * Content Script — injected into every page.
 *
 * Responsibilities:
 *  1. Report video metadata (currentTime, url, title) to the extension
 *  2. Inject the NotesMaker overlay iframe and toggle it
 *  3. Respond to messages from background / overlay
 */

// ─── Video helpers ────────────────────────────────────────────────────────────
function findVideo() {
  let v = document.querySelector('video')
  if (v) return v
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const iv = iframe.contentDocument?.querySelector('video')
      if (iv) return iv
    } catch (_) {}
  }
  return null
}

function getVideoInfo() {
  const video = findVideo()
  if (!video) return { hasVideo: false }
  return {
    hasVideo: true,
    currentTime: video.currentTime,
    duration: video.duration || 0,
    paused: video.paused,
    title:
      document.querySelector('h1')?.textContent?.trim() ||
      document.title ||
      '',
    url: window.location.href,
  }
}

// ─── Overlay injection ────────────────────────────────────────────────────────
const OVERLAY_ID    = 'notesmaker-overlay-root'
const TOGGLE_BTN_ID = 'notesmaker-toggle-btn'
const PANEL_WIDTH   = 380  // px

let overlayVisible = false

function ensureOverlay() {
  if (document.getElementById(OVERLAY_ID)) return

  // ── Host container ──────────────────────────────────────────────────────
  const host = document.createElement('div')
  host.id = OVERLAY_ID
  Object.assign(host.style, {
    position:   'fixed',
    top:        '0',
    right:      '0',
    width:      `${PANEL_WIDTH}px`,
    height:     '100vh',
    zIndex:     '2147483647',
    boxShadow:  '-4px 0 24px rgba(0,0,0,0.35)',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
    transform:  'translateX(100%)',
    display:    'flex',
    flexDirection: 'row',
  })

  // ── Toggle arrow tab (always visible on the right edge) ────────────────
  const tab = document.createElement('button')
  tab.id = TOGGLE_BTN_ID
  Object.assign(tab.style, {
    position:        'fixed',
    top:             '50%',
    right:           '0',
    transform:       'translateY(-50%)',
    zIndex:          '2147483647',
    width:           '22px',
    height:          '64px',
    background:      'linear-gradient(180deg,#6366f1,#8b5cf6)',
    border:          'none',
    borderRadius:    '8px 0 0 8px',
    cursor:          'pointer',
    color:           '#fff',
    fontSize:        '13px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    boxShadow:       '-2px 0 12px rgba(99,102,241,0.4)',
    transition:      'right 0.3s cubic-bezier(0.4,0,0.2,1), background 0.2s',
    padding:         '0',
    lineHeight:      '1',
  })
  tab.title = 'Toggle NotesMaker'
  tab.innerHTML = '◀'
  tab.addEventListener('mouseenter', () => { tab.style.background = 'linear-gradient(180deg,#4f46e5,#7c3aed)' })
  tab.addEventListener('mouseleave', () => { tab.style.background = 'linear-gradient(180deg,#6366f1,#8b5cf6)' })
  tab.addEventListener('click', toggleOverlay)

  // ── iframe ──────────────────────────────────────────────────────────────
  const iframe = document.createElement('iframe')
  iframe.src = chrome.runtime.getURL('sidepanel.html')
  Object.assign(iframe.style, {
    flex:    '1',
    width:   '100%',
    height:  '100%',
    border:  'none',
    display: 'block',
  })
  iframe.allow = 'display-capture; microphone'

  host.appendChild(iframe)
  document.documentElement.appendChild(host)
  document.documentElement.appendChild(tab)
}

function toggleOverlay() {
  ensureOverlay()
  overlayVisible = !overlayVisible

  const host = document.getElementById(OVERLAY_ID)
  const tab  = document.getElementById(TOGGLE_BTN_ID)

  if (overlayVisible) {
    host.style.transform = 'translateX(0)'
    tab.style.right      = `${PANEL_WIDTH}px`
    tab.innerHTML        = '▶'
    tab.title            = 'Minimize NotesMaker'
  } else {
    host.style.transform = 'translateX(100%)'
    tab.style.right      = '0'
    tab.innerHTML        = '◀'
    tab.title            = 'Open NotesMaker'
  }

  // Persist visibility state
  chrome.storage.local.set({ nm_overlay_visible: overlayVisible })
}

// Restore visibility on page load
chrome.storage.local.get('nm_overlay_visible', (result) => {
  if (result.nm_overlay_visible) {
    ensureOverlay()
    overlayVisible = false // will be toggled to true by toggleOverlay()
    toggleOverlay()
  } else {
    // Still inject the iframe (hidden) so it's ready and can receive messages
    ensureOverlay()
  }
})

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_VIDEO_TIME') {
    const video = findVideo()
    sendResponse({ currentTime: video ? video.currentTime : null })
    return false
  }

  if (message.type === 'GET_VIDEO_INFO') {
    sendResponse(getVideoInfo())
    return false
  }

  if (message.type === 'SEEK_VIDEO') {
    const video = findVideo()
    if (video && typeof message.time === 'number') video.currentTime = message.time
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'TOGGLE_OVERLAY') {
    toggleOverlay()
    sendResponse({ ok: true, visible: overlayVisible })
    return false
  }

  if (message.type === 'SHOW_OVERLAY') {
    ensureOverlay()
    if (!overlayVisible) toggleOverlay()
    sendResponse({ ok: true })
    return false
  }

  // Called by the iframe's minimize button (relayed via background.js → content script)
  if (message.type === 'MINIMIZE_OVERLAY') {
    if (overlayVisible) toggleOverlay()
    sendResponse({ ok: true })
    return false
  }
})

