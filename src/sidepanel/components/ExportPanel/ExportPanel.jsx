import { useState, useRef } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import {
  downloadNotesZip,
  downloadTranscript,
  copyMarkdownToClipboard,
  buildMarkdown,
  buildTranscriptText,
} from '../../utils/markdownExporter'
import './ExportPanel.css'

// ── Tag Editor ────────────────────────────────────────────────────────────────
function TagEditor({ tags, usedTags, onChange }) {
  const [inputVal, setInputVal] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef(null)
  const suggestions = usedTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(inputVal.toLowerCase()) && inputVal.length > 0
  )
  function addTag(tag) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInputVal(''); setShowSuggestions(false); inputRef.current?.focus()
  }
  function removeTag(tag) { onChange(tags.filter((t) => t !== tag)) }
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (inputVal.trim()) addTag(inputVal) }
    else if (e.key === 'Backspace' && inputVal === '' && tags.length > 0) removeTag(tags[tags.length - 1])
    else if (e.key === 'Escape') setShowSuggestions(false)
  }
  return (
    <div className="tag-editor">
      <div className="tag-pills-row">
        {tags.map((tag) => (
          <span key={tag} className="tag-pill">#{tag}
            <button className="tag-pill-del" onClick={() => removeTag(tag)}>×</button>
          </span>
        ))}
        <div className="tag-input-wrap">
          <input ref={inputRef} className="tag-input" type="text" placeholder="+ add tag…" value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setShowSuggestions(true) }}
            onKeyDown={handleKeyDown} onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="tag-suggestions">
              {suggestions.map((s) => <li key={s} className="tag-suggestion-item" onMouseDown={() => addTag(s)}>#{s}</li>)}
            </ul>
          )}
        </div>
      </div>
      <p className="tag-hint">Enter or comma to add · Backspace removes last</p>
    </div>
  )
}

// ── Source URL list ───────────────────────────────────────────────────────────
function SourceUrlList({ sourceUrls, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false)
  const [inputVal, setInputVal] = useState('')

  function commitAdd() {
    const val = inputVal.trim()
    if (val) onAdd(val, val)
    setInputVal(''); setAdding(false)
  }

  return (
    <div className="source-url-list">
      {sourceUrls.length === 0 && !adding && (
        <span className="source-empty">No sources recorded yet</span>
      )}
      {sourceUrls.map(({ url, title }) => (
        <div key={url} className="source-url-row">
          <a className="source-url-link" href={url} target="_blank" rel="noreferrer" title={title}>
            {url.length > 50 ? url.slice(0, 50) + '…' : url}
          </a>
          <button className="btn-icon source-url-del" onClick={() => onRemove(url)} title="Remove URL">✕</button>
        </div>
      ))}
      {adding ? (
        <div className="source-url-add-row">
          <input
            className="source-input"
            type="text"
            autoFocus
            placeholder="https://…"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd()
              if (e.key === 'Escape') { setAdding(false); setInputVal('') }
            }}
            onBlur={commitAdd}
          />
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 8px', marginTop: 4 }} onClick={() => setAdding(true)}>
          + Add URL
        </button>
      )}
    </div>
  )
}

export default function ExportPanel({ showToast }) {
  const session              = useNotesStore((s) => s.session)
  const blocks               = useNotesStore((s) => s.blocks)
  const settings             = useNotesStore((s) => s.settings)
  const exportMeta           = useNotesStore((s) => s.exportMeta)
  const usedTags             = useNotesStore((s) => s.usedTags)
  const setExportTags        = useNotesStore((s) => s.setExportTags)
  const addExportSourceUrl   = useNotesStore((s) => s.addExportSourceUrl)
  const removeExportSourceUrl = useNotesStore((s) => s.removeExportSourceUrl)

  const notesBlocks = blocks.filter((b) => b.addedToNotes)
  const allBlocks   = blocks
  const screenshots = blocks.filter((b) => b.type === 'screenshot')
  const transcript  = blocks.filter((b) => b.type === 'transcript')

  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview]         = useState(null)

  function effectiveSession() {
    return { ...session, sourceUrls: exportMeta.sourceUrls }
  }
  function effectiveSettings() {
    return { ...settings, exportTags: exportMeta.tags }
  }

  async function handleDownloadZip() {
    if (notesBlocks.length === 0) { showToast('⚠️ No notes to export'); return }
    setDownloading(true)
    try {
      await downloadNotesZip(effectiveSession(), notesBlocks, effectiveSettings(), allBlocks)
      showToast('✅ ZIP downloaded!')
    } catch { showToast('❌ Export failed') }
    finally { setDownloading(false) }
  }

  async function handleCopyMd() {
    if (notesBlocks.length === 0) { showToast('⚠️ No notes to copy'); return }
    await copyMarkdownToClipboard(effectiveSession(), notesBlocks, effectiveSettings())
    showToast('📋 Markdown copied!')
  }

  function handleDownloadTranscript() {
    if (transcript.length === 0) { showToast('⚠️ No transcript'); return }
    downloadTranscript(session, allBlocks)
    showToast('✅ Transcript downloaded!')
  }

  return (
    <div className="export-panel">
      {/* Stats */}
      <div className="export-stats">
        <StatCard icon="🎙️" value={transcript.length} label="Sentences" />
        <StatCard icon="🖼️" value={screenshots.length} label="Screenshots" />
        <StatCard icon="📝" value={notesBlocks.length} label="In Notes" />
      </div>

      {/* Frontmatter */}
      <div className="export-section">
        <h3 className="export-section-title">Frontmatter</h3>

        <div className="export-meta-row">
          <label className="export-meta-label">Tags</label>
          <TagEditor tags={exportMeta.tags} usedTags={usedTags} onChange={setExportTags} />
        </div>

        <div className="export-meta-row">
          <label className="export-meta-label">Source URLs
            <span className="export-meta-hint"> (auto-detected from recording tabs)</span>
          </label>
          <SourceUrlList
            sourceUrls={exportMeta.sourceUrls ?? []}
            onAdd={addExportSourceUrl}
            onRemove={removeExportSourceUrl}
          />
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
              <p className="export-card-desc">notes.md + assets/ + transcript.txt</p>
            </div>
          </div>
          <button id="btn-export-zip" className="btn btn-primary" onClick={handleDownloadZip} disabled={downloading || notesBlocks.length === 0}>
            {downloading ? <span className="animate-spin" style={{ display: 'inline-block' }}>⏳</span> : '⬇️ ZIP'}
          </button>
        </div>
        <div className="export-card">
          <div className="export-card-info">
            <span className="export-card-icon">📋</span>
            <div>
              <p className="export-card-name">Copy Markdown</p>
              <p className="export-card-desc">Markdown with inline base64 images</p>
            </div>
          </div>
          <button id="btn-copy-md" className="btn btn-ghost" onClick={handleCopyMd} disabled={notesBlocks.length === 0}>Copy</button>
        </div>
        <div className="export-card">
          <div className="export-card-info">
            <span className="export-card-icon">🎙️</span>
            <div>
              <p className="export-card-name">Download Transcript</p>
              <p className="export-card-desc">Full .txt with timestamps</p>
            </div>
          </div>
          <button id="btn-export-transcript" className="btn btn-ghost" onClick={handleDownloadTranscript} disabled={transcript.length === 0}>⬇️ TXT</button>
        </div>
      </div>

      {/* Preview */}
      <div className="export-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="export-section-title" style={{ marginBottom: 0 }}>Preview</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn btn-ghost ${preview === 'md' ? 'btn-active' : ''}`} style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setPreview(preview === 'md' ? null : 'md')}>Markdown</button>
            <button className={`btn btn-ghost ${preview === 'txt' ? 'btn-active' : ''}`} style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setPreview(preview === 'txt' ? null : 'txt')}>Transcript</button>
          </div>
        </div>
        {preview === 'md' && <pre className="export-preview">{buildMarkdown(effectiveSession(), notesBlocks, effectiveSettings()) || '(no notes yet)'}</pre>}
        {preview === 'txt' && <pre className="export-preview">{buildTranscriptText(allBlocks) || '(no transcript yet)'}</pre>}
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
