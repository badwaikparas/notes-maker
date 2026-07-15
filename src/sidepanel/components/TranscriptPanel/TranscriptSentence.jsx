import { useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime } from '../../utils/markdownExporter'
import './TranscriptPanel.css'

export default function TranscriptSentence({ block, index, anchoredScreenshots = [], showToast }) {
  const selectedIds  = useNotesStore((s) => s.selectedIds)
  const toggleSelect = useNotesStore((s) => s.toggleSelect)
  const selectRange  = useNotesStore((s) => s.selectRange)
  const toggleInNotes= useNotesStore((s) => s.toggleInNotes)
  const deleteBlock  = useNotesStore((s) => s.deleteBlock)

  const [hovered, setHovered]     = useState(false)
  const [copyFlash, setCopyFlash] = useState(false)

  const isSelected = selectedIds.has(block.id)

  async function handleClick(e) {
    if (e.shiftKey) { selectRange(block.id); return }
    await navigator.clipboard.writeText(block.text)
    setCopyFlash(true)
    showToast('📋 Copied!')
    setTimeout(() => setCopyFlash(false), 1000)
  }

  function handleMouseDown(e) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); toggleSelect(block.id) }
  }

  const ts = formatTime(block.timestamp)
  // Show ✏️ badge if the block has a noteOverride in the Notes tab
  const hasOverride = block.noteOverride != null

  return (
    <div className="sentence-group animate-fade-in">
      <div
        className={`sentence-row ${isSelected ? 'selected' : ''} ${copyFlash ? 'flash' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      >
        {ts && <span className="sentence-ts" title={`Video time: ${ts}`}>{ts}</span>}

        <p className="sentence-text">
          {block.text}
          {hasOverride && (
            <span className="sentence-edited-badge" title="This sentence has a user-edited version in Notes">✏️</span>
          )}
        </p>

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
              title="Delete sentence"
              onClick={(e) => { e.stopPropagation(); deleteBlock(block.id) }}
            >
              🗑️
            </button>
          </div>
        )}

        {block.addedToNotes && <span className="in-notes-dot" title="In notes" />}
        {isSelected && <span className="sentence-checkbox">✓</span>}
      </div>

      {/* Inline screenshot thumbnails (only when enabled in Settings) */}
      {anchoredScreenshots.map((ss) => (
        <div key={ss.id} className="anchored-screenshot">
          <img src={ss.imageDataUrl} alt="Screenshot" className="anchored-screenshot-img" />
          {ss.caption && <span className="anchored-screenshot-caption">{ss.caption}</span>}
        </div>
      ))}
    </div>
  )
}
