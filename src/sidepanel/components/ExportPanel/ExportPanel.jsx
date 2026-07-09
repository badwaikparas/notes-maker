import { useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import {
  downloadNotesZip,
  downloadTranscript,
  copyMarkdownToClipboard,
  buildMarkdown,
  buildTranscriptText,
} from '../../utils/markdownExporter'
import './ExportPanel.css'

export default function ExportPanel({ showToast }) {
  const session  = useNotesStore((s) => s.session)
  const blocks   = useNotesStore((s) => s.blocks)
  const settings = useNotesStore((s) => s.settings)

  const notesBlocks = blocks.filter((b) => b.addedToNotes)
  const allBlocks   = blocks
  const screenshots = blocks.filter((b) => b.type === 'screenshot')
  const transcript  = blocks.filter((b) => b.type === 'transcript')

  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview]         = useState(null) // 'md' | 'txt'

  async function handleDownloadZip() {
    if (notesBlocks.length === 0) { showToast('⚠️ No notes to export'); return }
    setDownloading(true)
    try {
      await downloadNotesZip(session, notesBlocks, settings, allBlocks)
      showToast('✅ ZIP downloaded!')
    } catch (e) {
      showToast('❌ Export failed')
    } finally {
      setDownloading(false)
    }
  }

  async function handleCopyMd() {
    if (notesBlocks.length === 0) { showToast('⚠️ No notes to copy'); return }
    await copyMarkdownToClipboard(session, notesBlocks, settings)
    showToast('📋 Markdown copied to clipboard!')
  }

  function handleDownloadTranscript() {
    if (transcript.length === 0) { showToast('⚠️ No transcript to download'); return }
    downloadTranscript(session, allBlocks)
    showToast('✅ Transcript downloaded!')
  }

  return (
    <div className="export-panel">
      {/* Stats */}
      <div className="export-stats">
        <StatCard icon="🎙️" value={transcript.length} label="Sentences" />
        <StatCard icon="🖼️" value={screenshots.length} label="Screenshots" />
        <StatCard icon="📝" value={notesBlocks.length}  label="In Notes" />
      </div>

      {/* Session info */}
      <div className="export-section">
        <h3 className="export-section-title">Session</h3>
        <div className="export-info-row">
          <span className="info-label">Title</span>
          <span className="info-value">{session.videoTitle || '—'}</span>
        </div>
        <div className="export-info-row">
          <span className="info-label">Created</span>
          <span className="info-value">{new Date(session.createdAt).toLocaleString()}</span>
        </div>
        {session.videoUrl && (
          <div className="export-info-row">
            <span className="info-label">Source</span>
            <a className="info-link" href={session.videoUrl} target="_blank" rel="noreferrer">
              {session.videoUrl.substring(0, 40)}…
            </a>
          </div>
        )}
      </div>

      {/* Export actions */}
      <div className="export-section">
        <h3 className="export-section-title">Export</h3>

        <div className="export-card">
          <div className="export-card-info">
            <span className="export-card-icon">🗜️</span>
            <div>
              <p className="export-card-name">Download ZIP for Obsidian</p>
              <p className="export-card-desc">
                notes.md + assets/ folder — unzip directly into your vault
              </p>
            </div>
          </div>
          <button
            id="btn-export-zip"
            className="btn btn-primary"
            onClick={handleDownloadZip}
            disabled={downloading || notesBlocks.length === 0}
          >
            {downloading ? <span className="animate-spin" style={{ display: 'inline-block' }}>⏳</span> : '⬇️ ZIP'}
          </button>
        </div>

        <div className="export-card">
          <div className="export-card-info">
            <span className="export-card-icon">📋</span>
            <div>
              <p className="export-card-name">Copy Markdown</p>
              <p className="export-card-desc">Copies notes as Markdown with inline images</p>
            </div>
          </div>
          <button
            id="btn-copy-md"
            className="btn btn-ghost"
            onClick={handleCopyMd}
            disabled={notesBlocks.length === 0}
          >
            Copy
          </button>
        </div>

        <div className="export-card">
          <div className="export-card-info">
            <span className="export-card-icon">🎙️</span>
            <div>
              <p className="export-card-name">Download Transcript</p>
              <p className="export-card-desc">Full transcript as plain .txt with timestamps</p>
            </div>
          </div>
          <button
            id="btn-export-transcript"
            className="btn btn-ghost"
            onClick={handleDownloadTranscript}
            disabled={transcript.length === 0}
          >
            ⬇️ TXT
          </button>
        </div>
      </div>

      {/* Markdown preview */}
      <div className="export-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="export-section-title" style={{ marginBottom: 0 }}>Preview</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn btn-ghost ${preview === 'md' ? 'btn-active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 8px' }}
              onClick={() => setPreview(preview === 'md' ? null : 'md')}
            >
              Markdown
            </button>
            <button
              className={`btn btn-ghost ${preview === 'txt' ? 'btn-active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 8px' }}
              onClick={() => setPreview(preview === 'txt' ? null : 'txt')}
            >
              Transcript
            </button>
          </div>
        </div>

        {preview === 'md' && (
          <pre className="export-preview">
            {buildMarkdown(session, notesBlocks, settings) || '(no notes yet)'}
          </pre>
        )}
        {preview === 'txt' && (
          <pre className="export-preview">
            {buildTranscriptText(allBlocks) || '(no transcript yet)'}
          </pre>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
