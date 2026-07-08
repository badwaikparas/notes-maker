import { useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import { formatTime } from '../../utils/markdownExporter'
import './ScreenshotGallery.css'

export default function ScreenshotGallery({ showToast }) {
  const blocks        = useNotesStore((s) => s.blocks)
  const updateCaption = useNotesStore((s) => s.updateCaption)
  const deleteBlock   = useNotesStore((s) => s.deleteBlock)
  const toggleInNotes = useNotesStore((s) => s.toggleInNotes)

  const screenshots = blocks.filter((b) => b.type === 'screenshot')

  const [lightbox, setLightbox] = useState(null)
  const [editingId, setEditingId] = useState(null)

  if (screenshots.length === 0) {
    return (
      <div className="gallery-empty">
        <div className="empty-icon">🖼️</div>
        <p className="empty-title">No screenshots yet</p>
        <p className="empty-sub">
          Press <kbd>Ctrl+Shift+S</kbd> while watching a video to capture a frame.
          <br />
          Screenshots are automatically anchored to the transcript sentence being spoken.
        </p>
      </div>
    )
  }

  return (
    <div className="gallery-panel">
      <div className="gallery-header">
        <span className="gallery-count">{screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="gallery-grid">
        {screenshots.map((ss) => (
          <div key={ss.id} className="gallery-card animate-fade-in">
            {/* Image */}
            <div className="gallery-img-wrap" onClick={() => setLightbox(ss)}>
              <img src={ss.imageDataUrl} alt="Screenshot" className="gallery-img" />
              <div className="gallery-img-overlay">
                <span>🔍 View</span>
              </div>
            </div>

            {/* Meta */}
            <div className="gallery-card-body">
              {ss.timestamp !== null && (
                <span className="gallery-ts">{formatTime(ss.timestamp)}</span>
              )}
              {/* Caption */}
              {editingId === ss.id ? (
                <input
                  type="text"
                  className="caption-field"
                  placeholder="Add caption…"
                  defaultValue={ss.caption}
                  autoFocus
                  onBlur={(e) => { updateCaption(ss.id, e.target.value); setEditingId(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <button className="caption-placeholder" onClick={() => setEditingId(ss.id)}>
                  {ss.caption || '+ Caption'}
                </button>
              )}

              {/* Actions */}
              <div className="gallery-card-actions">
                <button
                  className={`btn btn-ghost`}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => { toggleInNotes(ss.id); showToast(ss.addedToNotes ? 'Removed from notes' : 'Added to notes') }}
                >
                  {ss.addedToNotes ? '✅ In Notes' : '📝 Add to Notes'}
                </button>
                <button
                  className="btn-icon"
                  onClick={() => { deleteBlock(ss.id); showToast('🗑️ Deleted') }}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close btn-icon" onClick={() => setLightbox(null)}>✕</button>
            <img src={lightbox.imageDataUrl} alt="Screenshot full" />
            {lightbox.caption && <p className="lightbox-caption">{lightbox.caption}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
