import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from './store/useNotesStore'
import { loadSavedSession, saveSession, startAutoSave, stopAutoSave } from './utils/storageManager'
import Toolbar from './components/Toolbar/Toolbar'
import TranscriptPanel from './components/TranscriptPanel/TranscriptPanel'
import ScreenshotGallery from './components/ScreenshotGallery/ScreenshotGallery'
import NotesPreview from './components/NotesPreview/NotesPreview'
import ExportPanel from './components/ExportPanel/ExportPanel'
import Settings from './components/Settings/Settings'
import './App.css'

const TABS = [
  { id: 'transcript',  label: 'Transcript',  icon: '🎙️' },
  { id: 'notes',       label: 'Notes',        icon: '📝' },
  { id: 'screenshots', label: 'Screenshots',  icon: '🖼️' },
  { id: 'export',      label: 'Export',       icon: '⬇️' },
  { id: 'settings',    label: 'Settings',     icon: '⚙️' },
]

export default function App() {
  const activeTab            = useNotesStore((s) => s.activeTab)
  const setActiveTab         = useNotesStore((s) => s.setActiveTab)
  const loadSession          = useNotesStore((s) => s.loadSession)
  const addScreenshotBlock   = useNotesStore((s) => s.addScreenshotBlock)
  const getSerializedSession = useNotesStore((s) => s.getSerializedSession)

  const [recoverySession, setRecoverySession] = useState(null)
  const [toast, setToast]                     = useState({ msg: '', show: false })
  const toastTimer = useRef(null)

  function showToast(msg, duration = 2500) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, show: true })
    toastTimer.current = setTimeout(() => setToast({ msg: '', show: false }), duration)
  }

  // Minimize: tell the parent page's content script to hide the overlay
  function handleMinimize() {
    try {
      // When running as an iframe, this posts to the content script indirectly.
      // The content script injected the iframe and owns the toggle tab.
      chrome.runtime.sendMessage({ type: 'MINIMIZE_OVERLAY' })
    } catch (_) {}
    // Also try parent window message (if same origin — won't work cross-origin, but safe)
    try { window.parent.postMessage({ type: 'NM_MINIMIZE' }, '*') } catch (_) {}
  }

  useEffect(() => {
    // 1. Check for a saved session to offer recovery
    loadSavedSession().then((saved) => {
      if (saved?.blocks?.length > 0) setRecoverySession(saved)
    })

    // 2. Drain screenshots queued while overlay was hidden
    chrome.runtime.sendMessage({ type: 'DRAIN_SCREENSHOT_QUEUE' }, (resp) => {
      if (chrome.runtime.lastError) return
      const queue = resp?.queue ?? []
      if (queue.length > 0) {
        queue.forEach(({ imageDataUrl, videoTime }) => addScreenshotBlock(imageDataUrl, videoTime))
        showToast(`📸 ${queue.length} screenshot${queue.length > 1 ? 's' : ''} restored`)
      }
    })

    // 3. Listen for SCREENSHOT_TAKEN (sent by background → content script → here via chrome.runtime)
    function handleMessage(message) {
      if (message.type === 'SCREENSHOT_TAKEN') {
        const { imageDataUrl, videoTime } = message.payload
        addScreenshotBlock(imageDataUrl, videoTime)
        showToast('📸 Screenshot captured!')
      }
      // Content script can tell us to minimize
      if (message.type === 'MINIMIZE_OVERLAY') {
        // No-op here; the content script handles the visual hide
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)

    // 4. Auto-save
    startAutoSave(getSerializedSession)
    window.addEventListener('beforeunload', () => saveSession(getSerializedSession()))

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
      stopAutoSave()
    }
  }, [])

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-icon">◈</span>
          <span className="app-logo-text">NotesMaker</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Toolbar showToast={showToast} />
          {/* Minimize arrow — collapses the overlay back to the tab */}
          <button
            id="btn-minimize-overlay"
            className="btn-icon"
            onClick={handleMinimize}
            title="Minimize panel (▶ tab stays on the right)"
            style={{ fontSize: '16px', opacity: 0.7 }}
          >
            ▶
          </button>
        </div>
      </header>

      {/* Session Recovery Banner */}
      {recoverySession && (
        <div className="recovery-banner animate-fade-in">
          <div className="recovery-banner-info">
            <span className="recovery-icon">💾</span>
            <span>
              Unsaved session found
              <span className="recovery-meta">
                · {recoverySession.blocks?.length ?? 0} blocks
                · {new Date(recoverySession.savedAt).toLocaleTimeString()}
              </span>
            </span>
          </div>
          <div className="recovery-actions">
            <button
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => { loadSession(recoverySession); setRecoverySession(null); showToast('✅ Session restored!') }}
            >
              Restore
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => setRecoverySession(null)}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Tab Nav */}
      <nav className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="tab-content">
        {activeTab === 'transcript'  && <TranscriptPanel showToast={showToast} />}
        {activeTab === 'notes'       && <NotesPreview showToast={showToast} />}
        {activeTab === 'screenshots' && <ScreenshotGallery showToast={showToast} />}
        {activeTab === 'export'      && <ExportPanel showToast={showToast} />}
        {activeTab === 'settings'    && <Settings />}
      </main>

      {/* Toast */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>{toast.msg}</div>
    </div>
  )
}
