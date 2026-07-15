import { useState, useRef, useEffect } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime, buildMarkdown } from '../../utils/markdownExporter'
import './NotesPreview.css'

// ── Minimal inline markdown renderer ────────────────────────────────────────
function renderInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1</a>')
}

function MarkdownLine({ text }) {
  const h3 = text.match(/^### (.+)/); if (h3) return <h3 className="md-h3" dangerouslySetInnerHTML={{ __html: renderInline(h3[1]) }} />
  const h2 = text.match(/^## (.+)/);  if (h2) return <h2 className="md-h2" dangerouslySetInnerHTML={{ __html: renderInline(h2[1]) }} />
  const h1 = text.match(/^# (.+)/);   if (h1) return <h1 className="md-h1" dangerouslySetInnerHTML={{ __html: renderInline(h1[1]) }} />
  const bq = text.match(/^> (.+)/);   if (bq) return <blockquote className="md-blockquote" dangerouslySetInnerHTML={{ __html: renderInline(bq[1]) }} />
  if (text.match(/^---+$/)) return <hr className="md-hr" />
  const li = text.match(/^[-*] (.+)/); if (li) return <li className="md-li" dangerouslySetInnerHTML={{ __html: renderInline(li[1]) }} />
  if (!text.trim()) return <div className="md-spacer" />
  return <p className="md-p" dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
}

function AutoTextarea({ value, onChange, onBlur, onKeyDown }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px' }
  }, [value])
  return (
    <textarea
      ref={ref}
      className="md-textarea"
      value={value}
      onChange={(e) => { onChange(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      spellCheck
      autoFocus
    />
  )
}

// ── Get the display text for a block in the notes view ──────────────────────
function noteDisplayText(block) {
  if (block.type === 'transcript') {
    // Use the override if set, otherwise original text
    const body = block.noteOverride ?? block.text
    const ts = block.timestamp !== null ? `> [${formatTime(block.timestamp)}] ` : ''
    return `${ts}${body}`
  }
  if (block.type === 'manual') return block.text || ''
  return block.text || ''
}

// ── Get editable seed text (no timestamp prefix) ────────────────────────────
function editSeedText(block) {
  if (block.type === 'transcript') return block.noteOverride ?? block.text
  return block.text || ''
}

export default function NotesPreview({ showToast }) {
  const session               = useNotesStore((s) => s.session)
  const blocks                = useNotesStore((s) => s.blocks)
  const settings              = useNotesStore((s) => s.settings)
  const toggleInNotes         = useNotesStore((s) => s.toggleInNotes)
  const setNoteOverride       = useNotesStore((s) => s.setNoteOverride)
  const clearNoteOverride     = useNotesStore((s) => s.clearNoteOverride)
  const addAllTranscriptToNotes = useNotesStore((s) => s.addAllTranscriptToNotes)
  const exportMeta            = useNotesStore((s) => s.exportMeta)

  const notesBlocks      = blocks.filter((b) => b.addedToNotes)
  const transcriptBlocks = blocks.filter((b) => b.type === 'transcript')
  const hasNotes         = notesBlocks.length > 0
  const allInNotes       = transcriptBlocks.length > 0 && transcriptBlocks.every((b) => b.addedToNotes)

  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText]   = useState('')
  const [viewMode, setViewMode]   = useState('rendered')

  function startEdit(block) {
    setEditingId(block.id)
    setEditText(editSeedText(block))
  }

  function commitEdit() {
    if (editingId) {
      const trimmed = editText.trim()
      // Find block to check type
      const block = blocks.find((b) => b.id === editingId)
      if (block?.type === 'transcript') {
        // Only store override if it actually differs from original
        if (trimmed && trimmed !== block.text) {
          setNoteOverride(editingId, trimmed)
        } else if (!trimmed || trimmed === block.text) {
          clearNoteOverride(editingId)
        }
      } else {
        setNoteOverride(editingId, trimmed || (block?.text ?? ''))
      }
    }
    setEditingId(null)
    setEditText('')
  }

  async function handleCopyMarkdown() {
    const md = buildMarkdown(session, notesBlocks, { ...settings, exportTags: exportMeta.tags }, exportMeta)
    await navigator.clipboard.writeText(md)
    showToast('📋 Markdown copied!')
  }

  return (
    <div className="notes-panel">
      {/* Toolbar */}
      <div className="notes-toolbar">
        <span className="notes-title">
          {session.videoTitle || 'Notes'}
          {hasNotes && <span className="notes-count">{notesBlocks.length}</span>}
        </span>
        <div className="notes-actions">
          {transcriptBlocks.length > 0 && !allInNotes && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              onClick={() => { addAllTranscriptToNotes(); showToast(`📝 Added all ${transcriptBlocks.length} lines`) }}
              title="Add all transcript lines to notes"
            >
              📥 Add All
            </button>
          )}
          <button
            className={`btn btn-ghost ${viewMode === 'raw' ? 'btn-active' : ''}`}
            style={{ fontSize: '11px', padding: '4px 8px' }}
            onClick={() => setViewMode(v => v === 'rendered' ? 'raw' : 'rendered')}
          >
            {viewMode === 'rendered' ? '</> Raw' : '👁 Preview'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '11px', padding: '4px 8px' }}
            onClick={handleCopyMarkdown}
            disabled={!hasNotes}
          >
            📋 MD
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!hasNotes && (
        <div className="notes-empty">
          <div className="empty-icon">📝</div>
          <p className="empty-title">Your notes will appear here</p>
          <p className="empty-sub">
            Hover a transcript line and click <strong>📝</strong>, or use <strong>📥 Add All</strong> above.
          </p>
        </div>
      )}

      {/* Content */}
      {hasNotes && (
        <div className="notes-content">
          {/* Source pills */}
          <div className="notes-frontmatter">
            <span className="frontmatter-pill">📅 {new Date(session.createdAt).toLocaleDateString()}</span>
            {session.videoTitle && <span className="frontmatter-pill">🎬 {session.videoTitle}</span>}
            {exportMeta.sourceUrls?.map(({ url, title }) => (
              <a key={url} className="frontmatter-pill frontmatter-link" href={url} target="_blank" rel="noreferrer" title={title}>
                🔗 {new URL(url).hostname.replace('www.', '')}
              </a>
            ))}
          </div>

          <div className="notes-blocks">
            {notesBlocks.map((block) => (
              <NotesBlock
                key={block.id}
                block={block}
                isEditing={editingId === block.id}
                editText={editText}
                viewMode={viewMode}
                onStartEdit={() => startEdit(block)}
                onEditChange={setEditText}
                onEditBlur={commitEdit}
                onEditKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditingId(null); setEditText('') }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitEdit()
                }}
                onResetOverride={() => clearNoteOverride(block.id)}
                toggleInNotes={toggleInNotes}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NotesBlock({ block, isEditing, editText, viewMode, onStartEdit, onEditChange, onEditBlur, onEditKeyDown, onResetOverride, toggleInNotes }) {
  if (block.type === 'screenshot') {
    return (
      <div className="notes-block notes-block-screenshot animate-fade-in">
        <img src={block.imageDataUrl} alt="Screenshot" className="notes-screenshot-img" />
        {block.caption && <p className="notes-screenshot-caption">{block.caption}</p>}
        <div className="notes-block-meta">
          {block.timestamp !== null && <span className="notes-ts">📸 {formatTime(block.timestamp)}</span>}
          <button className="btn-icon notes-block-remove" onClick={() => toggleInNotes(block.id)} title="Remove from notes">✕</button>
        </div>
      </div>
    )
  }

  const isTranscript = block.type === 'transcript'
  const hasOverride  = isTranscript && block.noteOverride != null
  const displayText  = noteDisplayText(block)

  return (
    <div
      className={`notes-block notes-block-text animate-fade-in ${isEditing ? 'editing' : ''} ${hasOverride ? 'overridden' : ''}`}
      onDoubleClick={!isEditing ? onStartEdit : undefined}
      title={!isEditing ? 'Double-click to edit' : undefined}
    >
      {isEditing ? (
        <div className="notes-editor-wrap">
          {/* Show original transcript above editor as reference */}
          {isTranscript && (
            <div className="notes-editor-original">
              <span className="notes-editor-original-label">Original:</span>
              <span className="notes-editor-original-text">{block.text}</span>
            </div>
          )}
          <AutoTextarea
            value={editText}
            onChange={onEditChange}
            onBlur={onEditBlur}
            onKeyDown={onEditKeyDown}
          />
          <div className="notes-editor-hint">Ctrl+Enter to save · Esc to cancel</div>
        </div>
      ) : viewMode === 'raw' ? (
        <pre className="notes-raw-text">{displayText}</pre>
      ) : (
        <div className="notes-rendered">
          {displayText.split('\n').map((line, i) => <MarkdownLine key={i} text={line} />)}
        </div>
      )}

      {/* Original transcript reference (shown when override is active, not editing) */}
      {!isEditing && hasOverride && (
        <div className="notes-override-badge" title={`Original: "${block.text}"`}>
          <span className="notes-override-icon">✏️</span>
          <span className="notes-override-original" title="Click to revert to original" onClick={onResetOverride}>
            {block.text.length > 60 ? block.text.slice(0, 60) + '…' : block.text}
          </span>
        </div>
      )}

      {/* Hover actions */}
      {!isEditing && (
        <div className="notes-block-actions">
          <button className="btn-icon" onClick={onStartEdit} title="Edit">✏️</button>
          {hasOverride && (
            <button className="btn-icon" onClick={onResetOverride} title="Revert to original transcript">↩</button>
          )}
          <button className="btn-icon notes-block-remove" onClick={() => toggleInNotes(block.id)} title="Remove from notes">✕</button>
        </div>
      )}
    </div>
  )
}
