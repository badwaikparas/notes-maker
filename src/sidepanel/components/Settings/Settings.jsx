import { useState, useEffect } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import './Settings.css'

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'ja-JP', label: 'Japanese' },
]

export default function Settings() {
  const settings       = useNotesStore((s) => s.settings)
  const updateSettings = useNotesStore((s) => s.updateSettings)
  const [currentShortcut, setCurrentShortcut] = useState('Ctrl+Shift+S')

  // Read the actual shortcut from Chrome and update on every visit to this tab
  useEffect(() => {
    function fetchShortcut() {
      chrome.commands.getAll((commands) => {
        const screenshotCommand = commands.find(c => c.name === 'take-screenshot')
        if (screenshotCommand?.shortcut) {
          setCurrentShortcut(screenshotCommand.shortcut)
        }
      })
    }
    fetchShortcut()
    // Re-poll every 3 s so changes made in chrome://extensions/shortcuts reflect quickly
    const id = setInterval(fetchShortcut, 3000)
    return () => clearInterval(id)
  }, [])

  function toggle(key) {
    updateSettings({ [key]: !settings[key] })
  }

  return (
    <div className="settings-panel">
      <div className="settings-content">

        {/* ── Transcription ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">🎙️ Transcription</h3>

          <SettingRow
            label="Language"
            desc="Language for the Web Speech API recogniser"
          >
            <select
              value={settings.language}
              onChange={(e) => updateSettings({ language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </SettingRow>

          <div className="settings-info-box">
            <strong>How it works:</strong> Click <em>Record</em> in the header. A screen-share prompt
            will appear — select the tab you want to transcribe and check <strong>Share tab audio</strong>.
            The local Whisper server at <code>ws://127.0.0.1:5000</code> will receive the audio and
            return line-by-line transcripts. Transcription continues even if the sidebar is collapsed.
          </div>
        </section>

        {/* ── Screenshots ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">📸 Screenshots</h3>

          <SettingRow
            label="Shortcut"
            desc={<>Current shortcut — change in <strong>chrome://extensions/shortcuts</strong>, it will reflect here automatically</>}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <kbd className="shortcut-badge">{currentShortcut || '(none)'}</kbd>
              <button 
                className="btn-icon" 
                title="Edit Shortcut" 
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
                style={{ fontSize: '14px', padding: '4px' }}
              >
                ✏️
              </button>
            </div>
          </SettingRow>

          <SettingRow
            label="Auto-add to Notes"
            desc="Automatically include screenshots in your notes document when taken"
          >
            <Toggle
              checked={settings.autoAddScreenshotsToNotes}
              onChange={() => toggle('autoAddScreenshotsToNotes')}
              id="toggle-auto-screenshot"
            />
          </SettingRow>

          <SettingRow
            label="Delete from gallery on notes removal"
            desc="When a screenshot is removed from Notes, also delete it from the Screenshots gallery"
          >
            <Toggle
              checked={settings.deleteScreenshotFromGalleryOnNotesRemoval ?? false}
              onChange={() => toggle('deleteScreenshotFromGalleryOnNotesRemoval')}
              id="toggle-delete-screenshot-on-remove"
            />
          </SettingRow>
        </section>

        {/* ── Notes ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">📝 Notes</h3>

          <div className="settings-info-box">
            Double-click any block in the Notes tab to edit it as Markdown. Use the <strong>📥 Add All Lines</strong>
            button to bulk-add all transcript sentences to your notes. Toggle between rendered preview and raw markdown with the &lt;/&gt; button.
          </div>
        </section>

        {/* ── Auto-save ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">💾 Auto-Save</h3>

          <SettingRow
            label="Interval"
            desc="How often your session is saved automatically"
          >
            <select
              value={settings.autoSaveInterval}
              onChange={(e) => updateSettings({ autoSaveInterval: Number(e.target.value) })}
            >
              <option value={15}>Every 15s</option>
              <option value={30}>Every 30s</option>
              <option value={60}>Every 60s</option>
            </select>
          </SettingRow>

          <div className="settings-info-box">
            Sessions are saved automatically and recovered the next time you open the extension.
            You'll be shown a banner offering to restore the previous session.
          </div>
        </section>

        {/* ── Keyboard reference ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">⌨️ Keyboard Reference</h3>
          <div className="kbd-table">
            <KbdRow keys={['Click']}             action="Copy sentence to clipboard" />
            <KbdRow keys={['Shift', 'Click']}     action="Select a range of sentences" />
            <KbdRow keys={['Ctrl', 'Click']}      action="Toggle checkbox on sentence" />
            <KbdRow keys={['Double-click']}        action="Edit a note block" />
            <KbdRow keys={['Ctrl+Enter']}          action="Save note edit" />
            <KbdRow keys={[currentShortcut || 'Ctrl+Shift+S']} action="Capture screenshot" />
          </div>
        </section>

      </div>
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="setting-row">
      <div className="setting-row-label">
        <span className="setting-label">{label}</span>
        {desc && <span className="setting-desc">{desc}</span>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, id }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input type="checkbox" id={id} checked={checked} onChange={onChange} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </label>
  )
}

function KbdRow({ keys, action }) {
  return (
    <div className="kbd-row">
      <div className="kbd-keys">
        {keys.map((k, i) => (
          <span key={i}>
            <kbd className="kbd">{k}</kbd>
            {i < keys.length - 1 && <span className="kbd-plus">+</span>}
          </span>
        ))}
      </div>
      <span className="kbd-action">{action}</span>
    </div>
  )
}
