import { useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import TranscriptSentence from './TranscriptSentence'
import './TranscriptPanel.css'

export default function TranscriptPanel({ showToast }) {
  const blocks          = useNotesStore((s) => s.blocks)
  const transcription   = useNotesStore((s) => s.transcription)
  const selectedIds     = useNotesStore((s) => s.selectedIds)
  const scrollLocked    = useNotesStore((s) => s.scrollLocked)
  const settings        = useNotesStore((s) => s.settings)
  const clearSelection       = useNotesStore((s) => s.clearSelection)
  const addAllSelectedToNotes= useNotesStore((s) => s.addAllSelectedToNotes)
  const getSelectedText      = useNotesStore((s) => s.getSelectedText)

  const bottomRef = useRef(null)

  const transcriptBlocks = blocks.filter((b) => b.type === 'transcript')

  useEffect(() => {
    if (!scrollLocked && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [transcriptBlocks.length, scrollLocked])

  async function handleCopySelected() {
    const text = getSelectedText()
    await navigator.clipboard.writeText(text)
    showToast(`✅ ${selectedIds.size} sentence${selectedIds.size > 1 ? 's' : ''} copied!`)
    clearSelection()
  }

  function handleAddSelected() {
    addAllSelectedToNotes()
    showToast('📝 Added to notes')
    clearSelection()
  }

  const isEmpty = transcriptBlocks.length === 0

  return (
    <div className="transcript-panel">
      {isEmpty && !transcription.isActive && (
        <div className="transcript-empty">
          <div className="empty-icon">🎙️</div>
          <p className="empty-title">No transcript yet</p>
          <p className="empty-sub">
            Press <kbd>Record</kbd> to start transcribing the video audio.<br />
            Hover a sentence to see its timestamp.<br />
            Click to copy · Shift+Click to select a range.
          </p>
        </div>
      )}

      {transcription.error && (
        <div className="transcript-error animate-fade-in">
          ⚠️ {transcription.error}
        </div>
      )}

      <div className="transcript-list">
        {transcriptBlocks.map((block, idx) => {
          // Only show inline screenshots when the setting is enabled
          const anchored = settings.showScreenshotsInTranscript
            ? blocks.filter((b) => b.type === 'screenshot' && b.anchoredToId === block.id)
            : []
          return (
            <TranscriptSentence
              key={block.id}
              block={block}
              index={idx}
              anchoredScreenshots={anchored}
              showToast={showToast}
            />
          )
        })}

        {transcription.interimText && (
          <div className="interim-text animate-fade-in">
            <span className="interim-dot animate-pulse" />
            <span>{transcription.interimText}</span>
          </div>
        )}

        {transcription.isActive && (
          <div className="live-indicator">
            <span className="live-dot animate-pulse" />
            <span>Listening…</span>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {selectedIds.size > 0 && (
        <div className="selection-bar animate-fade-in">
          <span className="selection-count">
            {selectedIds.size} sentence{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="selection-actions">
            <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={handleAddSelected}>
              📝 Add to Notes
            </button>
            <button className="btn btn-primary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={handleCopySelected}>
              📋 Copy
            </button>
            <button className="btn-icon" onClick={clearSelection} title="Clear selection">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
