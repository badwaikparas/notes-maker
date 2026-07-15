import ReactDOM from 'react-dom/client'
import './popup.css'

function Popup() {
  function toggleOverlay() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }, () => {
        // Ignore errors (page may not have loaded content script yet)
        void chrome.runtime.lastError
      })
      window.close()
    })
  }

  function openShortcuts() {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
    window.close()
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <span className="popup-logo-icon">◈</span>
        <span className="popup-logo-text">NotesMaker</span>
      </header>

      <p className="popup-sub">AI-assisted note-taking for video courses</p>

      <button id="btn-toggle-overlay" className="popup-primary-btn" onClick={toggleOverlay}>
        Toggle Panel
        <span className="popup-btn-arrow">⇄</span>
      </button>

      <div className="popup-divider" />

      <div className="popup-tip">
        <span>📸</span>
        <span>Press <kbd>Ctrl+Shift+S</kbd> to capture a screenshot</span>
      </div>
      <div className="popup-tip">
        <span>⌨️</span>
        <button className="popup-link" onClick={openShortcuts}>Customise shortcuts</button>
      </div>
      <div className="popup-tip" style={{ fontSize: '10px', opacity: 0.6 }}>
        <span>💡</span>
        <span>The panel lives inside the page — works even with the sidebar closed</span>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Popup />)
