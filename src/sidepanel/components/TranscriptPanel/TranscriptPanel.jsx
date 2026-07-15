import { useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import TranscriptSentence from './TranscriptSentence'
import './TranscriptPanel.css'

/**
 * For each transcript block, find screenshots that "belong" after it.
 * A screenshot belongs after block[i] if its timestamp falls between
 * block[i].timestamp and block[i+1].timestamp (or after the last block).
 * Screenshots with null timestamps (no video) are appended after the last block.
 */
function buildScreenshotMap(transcriptBlocks, screenshotBlocks) {
  const map = {}           // blockId → screenshot[]
  const unanchored = []    // screenshots with no useful timestamp

  for (const ss of screenshotBlocks) {
    if (ss.anchoredToId && map[ss.anchoredToId] === undefined) {
      // respect explicit anchor set by addScreenshotBlock
      map[ss.anchoredToId] = map[ss.anchoredToId] || []
      map[ss.anchoredToId].push(ss)
      continue
    }

    // Find best transcript block by timestamp proximity
    if (ss.timestamp != null && transcriptBlocks.length > 0) {
      let best = transcriptBlocks[transcriptBlocks.length - 1]
      for (let i = 0; i < transcriptBlocks.length; i++) {
        const b = transcriptBlocks[i]
        if (b.timestamp == null) continue
        // Find the last transcript block whose timestamp <= screenshot timestamp
        if (b.timestamp <= ss.timestamp) best = b
        else break
      }
      const id = best.id
      if (!map[id]) map[id] = []
      map[id].push(ss)
    } else {
      unanchored.push(ss)
    }
  }

  // Unanchored screenshots go after the last transcript block
  if (transcriptBlocks.length > 0 && unanchored.length > 0) {
    const lastId = transcriptBlocks[transcriptBlocks.length - 1].id
    if (!map[lastId]) map[lastId] = []
    map[lastId].push(...unanchored)
  }

  return map
}

export default function TranscriptPanel({ showToast }) {
  const blocks               = useNotesStore((s) => s.blocks)
  const transcription        = useNotesStore((s) => s.transcription)
  const selectedIds          = useNotesStore((s) => s.selectedIds)
  const scrollLocked         = useNotesStore((s) => s.scrollLocked)
  const settings             = useNotesStore((s) => s.settings)
  const clearSelection       = useNotesStore((s) => s.clearSelection)
  const addAllSelectedToNotes= useNotesStore((s) => s.addAllSelectedToNotes)
  const getSelectedText      = useNotesStore((s) => s.getSelectedText)

  const bottomRef = useRef(null)

  const transcriptBlocks  = blocks.filter((b) => b.type === 'transcript')
  const screenshotBlocks  = blocks.filter((b) => b.type === 'screenshot')

  // Only build the map when the feature is enabled (saves work when toggled off)
  const screenshotMap = settings.showScreenshotsInTranscript
    ? buildScreenshotMap(transcriptBlocks, screenshotBlocks)
    : {}

  useEffect(() => {
    if (!scrollLocked && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [transcriptBlocks.length, scrollLocked])

  async function handleCopySelected() {
    const text = getSelectedText()
    await navigator.clipboard.writeText(text)
    showToast(`Copied ${selectedIds.size} sentence${selectedIds.size > 1 ? 's' : ''}!`)
    clearSelection()
  }

  function handleAddSelected() {
    addAllSelectedToNotes()
    showToast('Added to notes')
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
            Hover a sentence to see actions. Click to copy.
          </p>
        </div>
      )}

      {transcription.error && (
        <div className="transcript-error animate-fade-in">
          {transcription.error}
        </div>
      )}

      <div className="transcript-list">
        {transcriptBlocks.map((block, idx) => (
          <TranscriptSentence
            key={block.id}
            block={block}
            index={idx}
            anchoredScreenshots={screenshotMap[block.id] ?? []}
            showToast={showToast}
          />
        ))}

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
              Add to Notes
            </button>
            <button className="btn btn-primary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={handleCopySelected}>
              Copy
            </button>
            <button className="btn-icon" onClick={clearSelection} title="Clear selection">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
