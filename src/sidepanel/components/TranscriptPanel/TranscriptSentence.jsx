import { useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime } from '../../utils/markdownExporter'
import './TranscriptPanel.css'

export default function TranscriptSentence({ block, index, anchoredScreenshots = [], showToast }) {
  const selectedIds  = useNotesStore((s) => s.selectedIds)
  const settings     = useNotesStore((s) => s.settings)
  const toggleSelect = useNotesStore((s) => s.toggleSelect)
  const selectRange  = useNotesStore((s) => s.selectRange)
  const toggleInNotes= useNotesStore((s) => s.toggleInNotes)
  const deleteBlock  = useNotesStore((s) => s.deleteBlock)

  const [hovered, setHovered]     = useState(false)
  const [copyFlash, setCopyFlash] = useState(false)

  const isSelected  = selectedIds.has(block.id)
  const hasOverride = block.noteOverride != null
  const showTs      = settings.showTimestampsInTranscript ?? true

  async function handleClick(e) {
    if (e.shiftKey) { selectRange(block.id); return }
    await navigator.clipboard.writeText(block.text)
    setCopyFlash(true)
    showToast('Copied!')
    setTimeout(() => setCopyFlash(false), 1000)
  }

  function handleMouseDown(e) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); toggleSelect(block.id) }
  }

  const ts = formatTime(block.timestamp)

  return (
    <div className="sentence-group animate-fade-in">
      <div
        className={`sentence-row ${isSelected ? 'selected' : ''} ${copyFlash ? 'flash' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      >
        {showTs && ts && (
          <span className="sentence-ts" title={`Video time: ${ts}`}>{ts}</span>
        )}

        <p className="sentence-text">
          {block.text}
          {hasOverride && (
            <span className="sentence-edited-badge" title="Edited in Notes">✏️</span>
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
              title="Delete"
              onClick={(e) => { e.stopPropagation(); deleteBlock(block.id) }}
            >
              🗑️
            </button>
          </div>
        )}

        {block.addedToNotes && <span className="in-notes-dot" title="In notes" />}
        {isSelected && <span className="sentence-checkbox">✓</span>}
      </div>

      {/* Inline screenshot cards — same style as Notes tab */}
      {anchoredScreenshots.map((ss) => (
        <div key={ss.id} className="anchored-screenshot-card">
          <img src={ss.imageDataUrl} alt="Screenshot" className="anchored-screenshot-img" />
          {ss.caption && (
            <p className="anchored-screenshot-caption">{ss.caption}</p>
          )}
          <div className="anchored-screenshot-meta">
            {ss.timestamp != null && (
              <span className="anchored-screenshot-ts">📸 {formatTime(ss.timestamp)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
