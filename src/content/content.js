/**
 * Content Script — injected into every page.
 * Responsibilities:
 *   • Report video metadata (currentTime, duration, title)
 *   • Respond to messages from the background / side panel
 */

function findVideo() {
  // Try main document first, then iframes
  let video = document.querySelector('video')
  if (video) return video

  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const v = iframe.contentDocument?.querySelector('video')
      if (v) return v
    } catch (_) {
      // cross-origin iframe — skip
    }
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
    if (video && typeof message.time === 'number') {
      video.currentTime = message.time
    }
    sendResponse({ ok: true })
    return false
  }
})
