import ReactDOM from 'react-dom/client'
import './popup.css'

function Popup() {
  function openSidePanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.sidePanel.open({ tabId: tab.id })
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

      <button id="btn-open-panel" className="popup-primary-btn" onClick={openSidePanel}>
        Open Side Panel
        <span className="popup-btn-arrow">→</span>
      </button>

      <div className="popup-divider" />

      <div className="popup-tip">
        <span>📸</span>
        <span>Press <kbd>Ctrl+Shift+S</kbd> to capture a screenshot while watching</span>
      </div>
      <div className="popup-tip">
        <span>⌨️</span>
        <button className="popup-link" onClick={openShortcuts}>Customise shortcuts</button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Popup />)
