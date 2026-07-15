import { useState, useRef, useEffect } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime, buildMarkdown } from '../../utils/markdownExporter'
import './NotesPreview.css'

// Minimal markdown-to-HTML renderer (subset: headings, bold, italic, code, links, blockquotes, images)
function renderInlineMarkdown(text) {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1</a>')
}

function MarkdownLine({ text }) {
  // Headings
  const h3 = text.match(/^### (.+)/)
  if (h3) return <h3 className="md-h3" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(h3[1]) }} />
  const h2 = text.match(/^## (.+)/)
  if (h2) return <h2 className="md-h2" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(h2[1]) }} />
  const h1 = text.match(/^# (.+)/)
  if (h1) return <h1 className="md-h1" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(h1[1]) }} />
  // Blockquote (used for transcript timestamps)
  const bq = text.match(/^> (.+)/)
  if (bq) return <blockquote className="md-blockquote" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(bq[1]) }} />
  // Horizontal rule
  if (text.match(/^---+$/)) return <hr className="md-hr" />
  // Unordered list item
  const li = text.match(/^[-*] (.+)/)
  if (li) return <li className="md-li" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(li[1]) }} />
  // Empty line
  if (text.trim() === '') return <div className="md-spacer" />
  // Default paragraph
  return <p className="md-p" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text) }} />
}

function NotesEditor({ text, onChange, onBlur }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [text])

  return (
    <textarea
      ref={ref}
      className="md-textarea"
      value={text}
      onChange={(e) => {
        onChange(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }}
      onBlur={onBlur}
      spellCheck
    />
  )
}

export default function NotesPreview({ showToast }) {
  const session           = useNotesStore((s) => s.session)
  const blocks            = useNotesStore((s) => s.blocks)
  const settings          = useNotesStore((s) => s.settings)
  const toggleInNotes     = useNotesStore((s) => s.toggleInNotes)
  const deleteBlock       = useNotesStore((s) => s.deleteBlock)
  const updateBlockText   = useNotesStore((s) => s.updateBlockText)
  const addAllTranscriptToNotes = useNotesStore((s) => s.addAllTranscriptToNotes)

  const notesBlocks = blocks.filter((b) => b.addedToNotes)
  const transcriptBlocks = blocks.filter((b) => b.type === 'transcript')
  const hasNotes = notesBlocks.length > 0
  const allTranscriptInNotes = transcriptBlocks.length > 0 &&
    transcriptBlocks.every((b) => b.addedToNotes)

  // "preview mode" vs "edit mode" per block
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText]   = useState('')
  const [viewMode, setViewMode]   = useState('rendered') // 'rendered' | 'raw'

  function startEdit(block) {
    setEditingId(block.id)
    const md = blockToMarkdownText(block)
    setEditText(md)
  }

  function commitEdit() {
    if (editingId) {
      updateBlockText(editingId, editText)
    }
    setEditingId(null)
    setEditText('')
  }

  async function handleCopyMarkdown() {
    const md = buildMarkdown(session, notesBlocks, settings)
    await navigator.clipboard.writeText(md)
    showToast('📋 Markdown copied!')
  }

  function handleAddAllTranscript() {
    addAllTranscriptToNotes()
    showToast(`📝 Added all ${transcriptBlocks.length} lines to notes`)
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
          {transcriptBlocks.length > 0 && !allTranscriptInNotes && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              onClick={handleAddAllTranscript}
              title="Add all transcript lines to notes"
            >
              📥 Add All Lines
            </button>
          )}
          <button
            className={`btn btn-ghost ${viewMode === 'raw' ? 'btn-active' : ''}`}
            style={{ fontSize: '11px', padding: '4px 8px' }}
            onClick={() => setViewMode(v => v === 'rendered' ? 'raw' : 'rendered')}
            title={viewMode === 'rendered' ? 'Switch to raw markdown' : 'Switch to rendered view'}
          >
            {viewMode === 'rendered' ? '&lt;/&gt; Raw' : '👁 Preview'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '11px', padding: '4px 8px' }}
            onClick={handleCopyMarkdown}
            disabled={!hasNotes}
          >
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
            <strong>📝 Add to Notes</strong>, or use <strong>📥 Add All Lines</strong> above.
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

function blockToMarkdownText(block) {
  if (block.type === 'transcript') {
    const ts = block.timestamp !== null ? `> [${formatTime(block.timestamp)}] ` : ''
    return `${ts}${block.text}`
  }
  if (block.type === 'manual') return block.text
  return block.text || ''
}

function NotesBlock({ block, isEditing, editText, viewMode, onStartEdit, onEditChange, onEditBlur, onEditKeyDown, toggleInNotes, deleteBlock }) {
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

  // transcript or manual block — editable markdown
  const mdText = blockToMarkdownText(block)

  return (
    <div
      className={`notes-block notes-block-text animate-fade-in ${isEditing ? 'editing' : ''}`}
      onDoubleClick={!isEditing ? onStartEdit : undefined}
      title={!isEditing ? 'Double-click to edit' : undefined}
    >
      {isEditing ? (
        <div className="notes-editor-wrap">
          <NotesEditor
            text={editText}
            onChange={onEditChange}
            onBlur={onEditBlur}
            onKeyDown={onEditKeyDown}
          />
          <div className="notes-editor-hint">
            Ctrl+Enter to save · Esc to cancel
          </div>
        </div>
      ) : viewMode === 'raw' ? (
        <pre className="notes-raw-text">{mdText}</pre>
      ) : (
        <div className="notes-rendered">
          {mdText.split('\n').map((line, i) => (
            <MarkdownLine key={i} text={line} />
          ))}
        </div>
      )}

      {/* Actions (only visible on hover, not while editing) */}
      {!isEditing && (
        <div className="notes-block-actions">
          <button
            className="btn-icon notes-block-edit"
            onClick={onStartEdit}
            title="Edit"
          >
            ✏️
          </button>
          <button
            className="btn-icon notes-block-remove"
            onClick={() => toggleInNotes(block.id)}
            title="Remove from notes"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
