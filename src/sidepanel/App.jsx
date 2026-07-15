import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from './store/useNotesStore'
import { loadSavedSession, saveSession, startAutoSave, stopAutoSave } from './utils/storageManager'
import { API_VERSION } from '../config/version'
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
  const activeTab          = useNotesStore((s) => s.activeTab)
  const setActiveTab       = useNotesStore((s) => s.setActiveTab)
  const loadSession        = useNotesStore((s) => s.loadSession)
  const clearSession       = useNotesStore((s) => s.clearSession)
  const addScreenshotBlock = useNotesStore((s) => s.addScreenshotBlock)
  const getSerializedSession = useNotesStore((s) => s.getSerializedSession)

  const [recoverySession, setRecoverySession] = useState(null)
  const [toast, setToast]                     = useState({ msg: '', show: false })
  const [apiWarning, setApiWarning]            = useState(null)
  const toastTimer = useRef(null)

  // ── Show toast helper ────────────────────────────────────────────────────
  function showToast(msg, duration = 2500) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, show: true })
    toastTimer.current = setTimeout(() => setToast({ msg: '', show: false }), duration)
  }

  // ── On mount: check for saved session, drain screenshot queue, listen for new ones ───────
  useEffect(() => {
    // 1. Check API version compatibility with background worker
    chrome.runtime.sendMessage({ type: 'CHECK_API_VERSION', version: API_VERSION }, (resp) => {
      if (chrome.runtime.lastError) return // background may not be ready yet
      if (resp && !resp.ok) {
        setApiWarning(resp.error)
      }
    })

    // 2. Check for a saved session to offer recovery
    loadSavedSession().then((saved) => {
      if (saved && saved.blocks?.length > 0) {
        setRecoverySession(saved)
      }
    })

    // 3. Drain any screenshots captured while the panel was closed
    chrome.runtime.sendMessage({ type: 'DRAIN_SCREENSHOT_QUEUE' }, (resp) => {
      if (chrome.runtime.lastError) return
      const queue = resp?.queue ?? []
      if (queue.length > 0) {
        queue.forEach(({ imageDataUrl, videoTime }) => {
          addScreenshotBlock(imageDataUrl, videoTime)
        })
        showToast(`📸 ${queue.length} screenshot${queue.length > 1 ? 's' : ''} restored from queue`)
      }
    })

    // 4. Listen for SCREENSHOT_TAKEN from the background worker (panel is open)
    function handleMessage(message) {
      if (message.type === 'SCREENSHOT_TAKEN') {
        const { imageDataUrl, videoTime } = message.payload
        addScreenshotBlock(imageDataUrl, videoTime)
        showToast('📸 Screenshot captured!')
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)

    // 5. Auto-save every N seconds
    startAutoSave(getSerializedSession)

    // 6. Save on tab/window close
    window.addEventListener('beforeunload', () => {
      saveSession(getSerializedSession())
    })

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
      stopAutoSave()
    }
  }, [])

  function handleRestoreSession() {
    loadSession(recoverySession)
    setRecoverySession(null)
    showToast('✅ Session restored!')
  }

  function handleDiscardSession() {
    setRecoverySession(null)
  }

  return (
    <div className="app">
      {/* ── API Version Warning ── */}
      {apiWarning && (
        <div className="api-warning">
          ⚠️ {apiWarning}
          <button className="btn-icon" onClick={() => setApiWarning(null)} style={{ marginLeft: 8 }}>✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-icon">◈</span>
          <span className="app-logo-text">NotesMaker</span>
        </div>
        <Toolbar showToast={showToast} />
      </header>

      {/* ── Session Recovery Banner ── */}
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
            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={handleRestoreSession}>
              Restore
            </button>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={handleDiscardSession}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Tab Nav ── */}
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

      {/* ── Tab Content ── */}
      <main className="tab-content">
        {activeTab === 'transcript'  && <TranscriptPanel showToast={showToast} />}
        {activeTab === 'notes'       && <NotesPreview showToast={showToast} />}
        {activeTab === 'screenshots' && <ScreenshotGallery showToast={showToast} />}
        {activeTab === 'export'      && <ExportPanel showToast={showToast} />}
        {activeTab === 'settings'    && <Settings />}
      </main>

      {/* ── Toast ── */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>{toast.msg}</div>
    </div>
  )
}
