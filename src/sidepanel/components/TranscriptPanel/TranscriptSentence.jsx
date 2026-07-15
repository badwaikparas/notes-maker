import { useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime } from '../../utils/markdownExporter'
import './TranscriptPanel.css'

export default function TranscriptSentence({ block, index, showToast }) {
  const selectedIds    = useNotesStore((s) => s.selectedIds)
  const toggleSelect   = useNotesStore((s) => s.toggleSelect)
  const selectRange    = useNotesStore((s) => s.selectRange)
  const toggleInNotes  = useNotesStore((s) => s.toggleInNotes)
  const deleteBlock    = useNotesStore((s) => s.deleteBlock)

  const [hovered, setHovered]     = useState(false)
  const [copyFlash, setCopyFlash] = useState(false)

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
    </div>
  )
}
