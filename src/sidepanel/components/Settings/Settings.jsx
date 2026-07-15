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

  // Query the shortcut once on mount — no polling.
  // chrome.commands has no change event; user can click the ✏️ button and
  // come back to see the updated value. One extra query on focus covers this.
  const [currentShortcut, setCurrentShortcut] = useState('…')

  useEffect(() => {
    function fetchShortcut() {
      chrome.commands.getAll((commands) => {
        const cmd = commands.find((c) => c.name === 'take-screenshot')
        setCurrentShortcut(cmd?.shortcut || '(none set)')
      })
    }
    fetchShortcut()
    // Re-query when the window regains focus — handles the case where the
    // user opened chrome://extensions/shortcuts and came back.
    window.addEventListener('focus', fetchShortcut)
    return () => window.removeEventListener('focus', fetchShortcut)
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

          <SettingRow label="Language" desc="Language for the browser speech recogniser">
            <select value={settings.language} onChange={(e) => updateSettings({ language: e.target.value })}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </SettingRow>

          <div className="settings-info-box">
            <strong>How it works:</strong> Click <em>Record</em> in the header. A tab picker will appear
            — select the tab you want to transcribe. Audio is streamed to your local Whisper server at{' '}
            <code>ws://127.0.0.1:5000</code>.<br /><br />
            <strong>💡 Tip — record before pressing Play:</strong> Tab capture works even when the video
            is paused or hasn't started yet. Start recording first, then press Play on the video — you
            won't miss the beginning. Whisper simply stays silent until audio begins.
          </div>
        </section>


        {/* ── Screenshots ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">📸 Screenshots</h3>

          <SettingRow
            label="Shortcut"
            desc={<>Keyboard shortcut — edit in <strong>chrome://extensions/shortcuts</strong>, the value here updates automatically when you come back</>}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <kbd className="shortcut-badge">{currentShortcut}</kbd>
              <button
                className="btn-icon" title="Open shortcuts settings"
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
                style={{ fontSize: '14px', padding: '4px' }}
              >✏️</button>
            </div>
          </SettingRow>

          <SettingRow label="Auto-add to Notes" desc="Automatically include screenshots in Notes when taken">
            <Toggle checked={settings.autoAddScreenshotsToNotes} onChange={() => toggle('autoAddScreenshotsToNotes')} id="tog-auto-ss" />
          </SettingRow>

          <SettingRow
            label="Delete from gallery on Notes removal"
            desc="When a screenshot is removed from Notes, also remove it from the Screenshots gallery"
          >
            <Toggle checked={settings.deleteScreenshotFromGalleryOnNotesRemoval ?? false} onChange={() => toggle('deleteScreenshotFromGalleryOnNotesRemoval')} id="tog-del-ss" />
          </SettingRow>

          <SettingRow
            label="Show screenshots in Transcript tab"
            desc="Display inline screenshot thumbnails anchored to transcript sentences"
          >
            <Toggle checked={settings.showScreenshotsInTranscript ?? false} onChange={() => toggle('showScreenshotsInTranscript')} id="tog-ss-in-transcript" />
          </SettingRow>

          <SettingRow
            label="Show timestamps in Transcript"
            desc="Display [MM:SS] video time next to each transcribed sentence"
          >
            <Toggle checked={settings.showTimestampsInTranscript ?? true} onChange={() => toggle('showTimestampsInTranscript')} id="tog-ts-in-transcript" />
          </SettingRow>
        </section>

        {/* ── Notes ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">📝 Notes</h3>
          <div className="settings-info-box">
            <strong>Double-click</strong> any block to edit it. When editing a transcript sentence,
            the original text is shown above as a reference and preserved in the Transcript tab
            untouched. An amber border and ✏️ badge indicate user-edited blocks.
            Click the ↩ icon or the original text strip to revert to the source transcript.
          </div>
        </section>

        {/* Markdown Export */}
        <section className="settings-section">
          <h3 className="settings-section-title">📄 Markdown Export</h3>

          <SettingRow
            label="Include timestamps"
            desc="Add > [MM:SS] prefix to transcript lines in the exported .md file"
          >
            <Toggle checked={settings.includeTimestampsInMarkdown ?? true} onChange={() => toggle('includeTimestampsInMarkdown')} id="tog-ts-in-md" />
          </SettingRow>

          <SettingRow
            label="Include original when edited"
            desc="When a Note is edited, add an HTML comment with the original transcript text in the .md export"
          >
            <Toggle checked={settings.includeOriginalInMarkdown ?? false} onChange={() => toggle('includeOriginalInMarkdown')} id="tog-orig-in-md" />
          </SettingRow>
        </section>

        {/* Auto-save */}
        <section className="settings-section">
          <h3 className="settings-section-title">💾 Auto-Save</h3>
          <SettingRow label="Interval" desc="How often your session is auto-saved">
            <select value={settings.autoSaveInterval} onChange={(e) => updateSettings({ autoSaveInterval: Number(e.target.value) })}>
              <option value={15}>Every 15s</option>
              <option value={30}>Every 30s</option>
              <option value={60}>Every 60s</option>
            </select>
          </SettingRow>
        </section>

        {/* ── Keyboard reference ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">⌨️ Keyboard Reference</h3>
          <div className="kbd-table">
            <KbdRow keys={['Click']}           action="Copy sentence to clipboard" />
            <KbdRow keys={['Shift+Click']}      action="Select a range of sentences" />
            <KbdRow keys={['Ctrl+Click']}       action="Toggle checkbox on sentence" />
            <KbdRow keys={['Double-click']}     action="Edit a note block" />
            <KbdRow keys={['Ctrl+Enter']}       action="Save note edit" />
            <KbdRow keys={['Esc']}              action="Cancel note edit" />
            <KbdRow keys={[currentShortcut]}    action="Capture screenshot" />
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
      <span className="toggle-track"><span className="toggle-thumb" /></span>
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
