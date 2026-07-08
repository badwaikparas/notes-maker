import { useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime } from '../../utils/markdownExporter'
import './TranscriptPanel.css'

export default function TranscriptSentence({ block, index, anchoredScreenshots, showToast }) {
  const selectedIds    = useNotesStore((s) => s.selectedIds)
  const toggleSelect   = useNotesStore((s) => s.toggleSelect)
  const selectRange    = useNotesStore((s) => s.selectRange)
  const toggleInNotes  = useNotesStore((s) => s.toggleInNotes)
  const updateCaption  = useNotesStore((s) => s.updateCaption)
  const deleteBlock    = useNotesStore((s) => s.deleteBlock)

  const [hovered, setHovered]             = useState(false)
  const [copyFlash, setCopyFlash]         = useState(false)
  const [editingCaption, setEditingCaption] = useState(null) // screenshot id

  const isSelected = selectedIds.has(block.id)

  // ── Single click: copy sentence to clipboard ─────────────────────────────
  async function handleClick(e) {
    if (e.shiftKey) {
      // Shift+click → range select
      selectRange(block.id)
      return
    }
    // Normal click → copy
    await navigator.clipboard.writeText(block.text)
    setCopyFlash(true)
    showToast('📋 Copied!')
    setTimeout(() => setCopyFlash(false), 1000)
  }

  // ── Ctrl/Cmd+click: toggle checkbox selection ────────────────────────────
  function handleMouseDown(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      toggleSelect(block.id)
    }
  }

  const ts = formatTime(block.timestamp)

  return (
    <div className="sentence-group animate-fade-in">
      {/* ── Transcript sentence row ── */}
      <div
        className={`sentence-row ${isSelected ? 'selected' : ''} ${copyFlash ? 'flash' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      >
        {/* Timestamp badge */}
        {ts && (
          <span className="sentence-ts" title={`Video time: ${ts}`}>
            {ts}
          </span>
        )}

        {/* Sentence text */}
        <p className="sentence-text">{block.text}</p>

        {/* Hover actions */}
        {hovered && (
          <div className="sentence-actions">
            <button
              className="btn-icon"
              title={block.addedToNotes ? 'Remove from notes' : 'Add to notes'}
              onClick={(e) => { e.stopPropagation(); toggleInNotes(block.id) }}
            >
              {block.addedToNotes ? '✅' : '📝'}
            </button>
            <button
              className="btn-icon"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); deleteBlock(block.id) }}
            >
              🗑️
            </button>
          </div>
        )}

        {/* In-notes indicator */}
        {block.addedToNotes && (
          <span className="in-notes-dot" title="In notes" />
        )}

        {/* Checkbox (ctrl+click) */}
        {isSelected && (
          <span className="sentence-checkbox">✓</span>
        )}
      </div>

      {/* ── Inline anchored screenshots ── */}
      {anchoredScreenshots.map((ss) => (
        <div key={ss.id} className="inline-screenshot animate-fade-in">
          <div className="inline-screenshot-header">
            <span className="inline-screenshot-label">
              📸 Screenshot {ss.timestamp !== null ? `· ${formatTime(ss.timestamp)}` : ''}
            </span>
            <button
              className="btn-icon"
              onClick={() => deleteBlock(ss.id)}
              title="Delete screenshot"
            >
              🗑️
            </button>
          </div>
          <img
            src={ss.imageDataUrl}
            alt="Screenshot"
            className="inline-screenshot-img"
          />
          {editingCaption === ss.id ? (
            <input
              className="caption-input"
              type="text"
              placeholder="Add caption…"
              defaultValue={ss.caption}
              autoFocus
              onBlur={(e) => {
                updateCaption(ss.id, e.target.value)
                setEditingCaption(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') setEditingCaption(null)
              }}
            />
          ) : (
            <button
              className="caption-btn"
              onClick={() => setEditingCaption(ss.id)}
            >
              {ss.caption || '+ Add caption'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
