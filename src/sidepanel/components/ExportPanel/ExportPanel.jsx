import { useState, useRef, useEffect } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import {
  downloadNotesZip,
  downloadTranscript,
  copyMarkdownToClipboard,
  buildMarkdown,
  buildTranscriptText,
} from '../../utils/markdownExporter'
import './ExportPanel.css'

/**
 * Tag input with suggestions from previously used tags.
 */
function TagEditor({ tags, usedTags, onChange }) {
  const [inputVal, setInputVal] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef(null)

  const suggestions = usedTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(inputVal.toLowerCase()) && inputVal.length > 0
  )

  function addTag(tag) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) {
      onChange([...tags, t])
    }
    setInputVal('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputVal.trim()) addTag(inputVal)
    } else if (e.key === 'Backspace' && inputVal === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <div className="tag-editor">
      <div className="tag-pills-row">
        {tags.map((tag) => (
          <span key={tag} className="tag-pill">
            #{tag}
            <button
              className="tag-pill-del"
              onClick={() => removeTag(tag)}
              title={`Remove tag "${tag}"`}
            >
              ×
            </button>
          </span>
        ))}
        <div className="tag-input-wrap">
          <input
            ref={inputRef}
            className="tag-input"
            type="text"
            placeholder="+ add tag…"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setShowSuggestions(true) }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="tag-suggestions">
              {suggestions.map((s) => (
                <li key={s} className="tag-suggestion-item" onMouseDown={() => addTag(s)}>
                  #{s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="tag-hint">Press Enter or comma to add · Backspace to remove last</p>
    </div>
  )
}

export default function ExportPanel({ showToast }) {
  const session     = useNotesStore((s) => s.session)
  const blocks      = useNotesStore((s) => s.blocks)
  const settings    = useNotesStore((s) => s.settings)
  const exportMeta  = useNotesStore((s) => s.exportMeta)
  const usedTags    = useNotesStore((s) => s.usedTags)
  const setExportTags    = useNotesStore((s) => s.setExportTags)
  const setSourceOverride = useNotesStore((s) => s.setSourceOverride)

  const notesBlocks = blocks.filter((b) => b.addedToNotes)
  const allBlocks   = blocks
  const screenshots = blocks.filter((b) => b.type === 'screenshot')
  const transcript  = blocks.filter((b) => b.type === 'transcript')

  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview]         = useState(null) // 'md' | 'txt'
  const [editingSource, setEditingSource] = useState(false)
  const [sourceVal, setSourceVal]         = useState('')

  // Build an effective session for export that merges overrides
  function effectiveSession() {
    const source = exportMeta.sourceOverride.trim() || session.videoUrl
    return { ...session, videoUrl: source }
  }

  function effectiveSettings() {
    return { ...settings, exportTags: exportMeta.tags }
  }

  function startEditSource() {
    setSourceVal(exportMeta.sourceOverride || session.videoUrl || '')
    setEditingSource(true)
  }

  function commitSource() {
    const val = sourceVal.trim()
    // If blank, default back to original
    setSourceOverride(val)
    setEditingSource(false)
  }

  async function handleDownloadZip() {
    if (notesBlocks.length === 0) { showToast('⚠️ No notes to export'); return }
    setDownloading(true)
    try {
      await downloadNotesZip(effectiveSession(), notesBlocks, effectiveSettings(), allBlocks)
      showToast('✅ ZIP downloaded!')
    } catch (e) {
      showToast('❌ Export failed')
    } finally {
      setDownloading(false)
    }
  }

  async function handleCopyMd() {
    if (notesBlocks.length === 0) { showToast('⚠️ No notes to copy'); return }
    await copyMarkdownToClipboard(effectiveSession(), notesBlocks, effectiveSettings())
    showToast('📋 Markdown copied to clipboard!')
  }

  function handleDownloadTranscript() {
    if (transcript.length === 0) { showToast('⚠️ No transcript to download'); return }
    downloadTranscript(session, allBlocks)
    showToast('✅ Transcript downloaded!')
  }

  const displaySource = exportMeta.sourceOverride.trim() || session.videoUrl || ''

  return (
    <div className="export-panel">
      {/* Stats */}
      <div className="export-stats">
        <StatCard icon="🎙️" value={transcript.length} label="Sentences" />
        <StatCard icon="🖼️" value={screenshots.length} label="Screenshots" />
        <StatCard icon="📝" value={notesBlocks.length}  label="In Notes" />
      </div>

      {/* ── Frontmatter editor ── */}
      <div className="export-section">
        <h3 className="export-section-title">Frontmatter</h3>

        {/* Tags */}
        <div className="export-meta-row">
          <label className="export-meta-label">Tags</label>
          <TagEditor
            tags={exportMeta.tags}
            usedTags={usedTags}
            onChange={setExportTags}
          />
        </div>

        {/* Source URL */}
        <div className="export-meta-row">
          <label className="export-meta-label">Source URL</label>
          {editingSource ? (
            <div className="source-edit-wrap">
              <input
                className="source-input"
                type="text"
                value={sourceVal}
                onChange={(e) => setSourceVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSource()
                  if (e.key === 'Escape') { setEditingSource(false) }
                }}
                onBlur={commitSource}
                autoFocus
                placeholder={session.videoUrl || 'https://…'}
              />
            </div>
          ) : (
            <div className="source-display" onClick={startEditSource} title="Click to edit">
              <span className="source-url-text">
                {displaySource ? displaySource.substring(0, 45) + (displaySource.length > 45 ? '…' : '') : <em className="source-empty">No source — click to set</em>}
              </span>
              <span className="source-edit-icon">✏️</span>
            </div>
          )}
        </div>
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
            {buildMarkdown(effectiveSession(), notesBlocks, effectiveSettings()) || '(no notes yet)'}
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
