import { useNotesStore } from '../../store/useNotesStore'
import { formatTime, buildMarkdown } from '../../utils/markdownExporter'
import './NotesPreview.css'

export default function NotesPreview({ showToast }) {
  const session        = useNotesStore((s) => s.session)
  const blocks         = useNotesStore((s) => s.blocks)
  const settings       = useNotesStore((s) => s.settings)
  const toggleInNotes  = useNotesStore((s) => s.toggleInNotes)
  const deleteBlock    = useNotesStore((s) => s.deleteBlock)
  const addHeading     = useNotesStore((s) => s.addHeading)

  const notesBlocks    = blocks.filter((b) => b.addedToNotes)

  const hasNotes = notesBlocks.length > 0

  async function handleCopyMarkdown() {
    const md = buildMarkdown(session, notesBlocks, settings)
    await navigator.clipboard.writeText(md)
    showToast('📋 Markdown copied!')
  }

  function handleAddHeading() {
    const text = prompt('Heading text:')
    if (text?.trim()) {
      addHeading(text.trim(), settings.noteHeadingLevel)
      showToast('✅ Heading added')
    }
  }

  return (
    <div className="notes-panel">
      {/* ── Toolbar ── */}
      <div className="notes-toolbar">
        <span className="notes-title">
          {session.videoTitle || 'Notes'}
          {hasNotes && <span className="notes-count">{notesBlocks.length}</span>}
        </span>
        <div className="notes-actions">
          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={handleAddHeading}>
            + Heading
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={handleCopyMarkdown} disabled={!hasNotes}>
            📋 Copy MD
          </button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasNotes && (
        <div className="notes-empty">
          <div className="empty-icon">📝</div>
          <p className="empty-title">Your notes will appear here</p>
          <p className="empty-sub">
            In the Transcript tab, hover over a sentence and click{' '}
            <strong>📝 Add to Notes</strong>, or select multiple sentences and use the action bar.
            Screenshots marked as "Add to Notes" appear inline, anchored to their transcript context.
          </p>
        </div>
      )}

      {/* ── Notes content ── */}
      {hasNotes && (
        <div className="notes-content">
          {/* Frontmatter preview */}
          <div className="notes-frontmatter">
            <span className="frontmatter-pill">📅 {new Date(session.createdAt).toLocaleDateString()}</span>
            {session.videoTitle && <span className="frontmatter-pill">🎬 {session.videoTitle}</span>}
            {session.videoUrl   && (
              <a className="frontmatter-pill frontmatter-link" href={session.videoUrl} target="_blank" rel="noreferrer">
                🔗 Source
              </a>
            )}
          </div>

          {/* Block list */}
          <div className="notes-blocks">
            {notesBlocks.map((block) => (
              <NotesBlock
                key={block.id}
                block={block}
                toggleInNotes={toggleInNotes}
                deleteBlock={deleteBlock}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NotesBlock({ block, toggleInNotes, deleteBlock }) {
  if (block.type === 'heading') {
    const Tag = block.level || 'h2'
    return (
      <div className="notes-block notes-block-heading">
        <Tag className={`notes-heading ${block.level}`}>{block.text}</Tag>
        <button className="btn-icon notes-block-del" onClick={() => deleteBlock(block.id)}>🗑️</button>
      </div>
    )
  }

  if (block.type === 'screenshot') {
    return (
      <div className="notes-block notes-block-screenshot animate-fade-in">
        <img src={block.imageDataUrl} alt="Screenshot" className="notes-screenshot-img" />
        {block.caption && <p className="notes-screenshot-caption">{block.caption}</p>}
        <div className="notes-block-meta">
          {block.timestamp !== null && (
            <span className="notes-ts">📸 {formatTime(block.timestamp)}</span>
          )}
          <button 
            className="btn-icon notes-block-remove" 
            onClick={() => toggleInNotes(block.id)}
            title="Remove from notes"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // transcript or manual
  return (
    <div className="notes-block notes-block-text animate-fade-in">
      {block.timestamp !== null && (
        <span className="notes-ts">{formatTime(block.timestamp)}</span>
      )}
      <p className="notes-block-p">{block.text}</p>
      <button
        className="btn-icon notes-block-remove"
        onClick={() => toggleInNotes(block.id)}
        title="Remove from notes"
      >
        ✕
      </button>
    </div>
  )
}
