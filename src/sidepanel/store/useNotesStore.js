import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

/**
 * NoteBlock shapes:
 *
 * Transcript: { id, type:'transcript', timestamp, text, noteOverride, addedToNotes, selected }
 *   noteOverride — if set, this is the user-edited text shown in Notes instead of the original.
 *   The original `text` stays immutable for the transcript view.
 *
 * Screenshot: { id, type:'screenshot', timestamp, imageDataUrl, caption, anchoredToId, addedToNotes }
 * Manual:     { id, type:'manual', text, addedToNotes }
 */

const DEFAULT_SETTINGS = {
  language: 'en-US',
  autoSaveInterval: 30,
  autoAddScreenshotsToNotes: true,
  deleteScreenshotFromGalleryOnNotesRemoval: false,
  showScreenshotsInTranscript: false,  // inline screenshots anchored in transcript tab
  showTimestampsInTranscript: true,    // show [MM:SS] timestamps beside each sentence
  includeTimestampsInMarkdown: true,   // include > [MM:SS] prefix in exported markdown
  includeOriginalInMarkdown: false,    // include <!-- original: ... --> comment when text is edited
  screenshotQuality: 0.85,
}

export const useNotesStore = create((set, get) => ({
  // ── Session ──────────────────────────────────────────────────────────────
  session: {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    // sources: ordered-unique map { url -> title } accumulated across recordings
    sources: {},
    // legacy single fields kept for compatibility
    videoUrl: '',
    videoTitle: '',
  },

  // ── All blocks (ordered array) ────────────────────────────────────────────
  blocks: [],

  // ── Live transcription state ─────────────────────────────────────────────
  transcription: {
    isActive: false,
    interimText: '',
    error: null,
  },

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedIds: new Set(),
  rangeAnchorId: null,

  // ── UI ────────────────────────────────────────────────────────────────────
  activeTab: 'transcript',
  scrollLocked: false,

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: DEFAULT_SETTINGS,

  // ── Export metadata ───────────────────────────────────────────────────────
  exportMeta: {
    tags: ['notes', 'course'],
    // sourceUrls: array of { url, title } the user wants in the export
    // (pre-populated from session.sources; user can add/remove)
    sourceUrls: [],
  },

  // ── Previously used tags ──────────────────────────────────────────────────
  usedTags: ['notes', 'course'],

  // ── Source / video metadata ───────────────────────────────────────────────
  /**
   * Called when recording starts from a new tab.
   * Adds the URL as a unique key to session.sources.
   */
  addSourceUrl: (url, title) => {
    if (!url) return
    set((s) => {
      const sources = { ...s.session.sources }
      if (!sources[url]) sources[url] = title || url
      // Also keep single-field for backward compat
      return {
        session: {
          ...s.session,
          sources,
          videoUrl: url,
          videoTitle: title || s.session.videoTitle,
        },
        // Mirror into exportMeta.sourceUrls (deduped)
        exportMeta: {
          ...s.exportMeta,
          sourceUrls: Object.entries(sources).map(([u, t]) => ({ url: u, title: t })),
        },
      }
    })
  },

  removeSourceUrl: (url) => {
    set((s) => {
      const sources = { ...s.session.sources }
      delete sources[url]
      const remaining = Object.entries(sources)
      return {
        session: {
          ...s.session,
          sources,
          videoUrl: remaining.length > 0 ? remaining[remaining.length - 1][0] : '',
          videoTitle: remaining.length > 0 ? remaining[remaining.length - 1][1] : '',
        },
        exportMeta: {
          ...s.exportMeta,
          sourceUrls: remaining.map(([u, t]) => ({ url: u, title: t })),
        },
      }
    })
  },

  addExportSourceUrl: (url, title) => {
    if (!url) return
    set((s) => {
      const existing = s.exportMeta.sourceUrls.map((x) => x.url)
      if (existing.includes(url)) return {}
      return {
        exportMeta: {
          ...s.exportMeta,
          sourceUrls: [...s.exportMeta.sourceUrls, { url: url.trim(), title: title || url.trim() }],
        },
      }
    })
  },

  removeExportSourceUrl: (url) => {
    set((s) => ({
      exportMeta: {
        ...s.exportMeta,
        sourceUrls: s.exportMeta.sourceUrls.filter((x) => x.url !== url),
      },
    }))
  },

  // Legacy setter kept for compat
  setVideoInfo: (url, title) => get().addSourceUrl(url, title),

  // ── Transcription controls ────────────────────────────────────────────────
  setTranscriptionActive: (isActive) =>
    set((s) => ({ transcription: { ...s.transcription, isActive, error: null } })),

  setInterimText: (interimText) =>
    set((s) => ({ transcription: { ...s.transcription, interimText } })),

  setTranscriptionError: (error) =>
    set((s) => ({ transcription: { ...s.transcription, error, isActive: false } })),

  addTranscriptBlock: (text, timestamp) => {
    if (!text.trim()) return
    const block = {
      id: uuidv4(),
      type: 'transcript',
      timestamp: timestamp ?? null,
      text: text.trim(),
      noteOverride: null,   // user-edited version for notes; null = use original text
      addedToNotes: false,
      selected: false,
    }
    set((s) => ({
      blocks: [...s.blocks, block],
      transcription: { ...s.transcription, interimText: '' },
    }))
    return block.id
  },

  // ── Screenshots ───────────────────────────────────────────────────────────
  addScreenshotBlock: (imageDataUrl, videoTime) => {
    const { blocks, settings } = get()
    let anchoredToId = null
    if (videoTime !== null) {
      const tBlocks = blocks.filter((b) => b.type === 'transcript' && b.timestamp !== null)
      let closest = null, minDiff = Infinity
      for (const b of tBlocks) {
        const diff = Math.abs(b.timestamp - videoTime)
        if (diff < minDiff) { minDiff = diff; closest = b }
      }
      anchoredToId = closest?.id ?? null
    }
    const block = {
      id: uuidv4(),
      type: 'screenshot',
      timestamp: videoTime,
      imageDataUrl,
      caption: '',
      anchoredToId,
      addedToNotes: settings.autoAddScreenshotsToNotes,
    }
    set((s) => ({ blocks: [...s.blocks, block] }))
    return block.id
  },

  updateCaption: (id, caption) =>
    set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, caption } : b)) })),

  deleteBlock: (id) =>
    set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),

  // ── Notes assembly ────────────────────────────────────────────────────────
  addToNotes: (id) =>
    set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, addedToNotes: true } : b)) })),

  removeFromNotes: (id) => {
    const { settings, blocks } = get()
    const block = blocks.find((b) => b.id === id)
    if (!block) return
    if (block.type === 'screenshot' && settings.deleteScreenshotFromGalleryOnNotesRemoval) {
      set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) }))
    } else {
      set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, addedToNotes: false } : b)) }))
    }
  },

  toggleInNotes: (id) => {
    const block = get().blocks.find((b) => b.id === id)
    if (!block) return
    if (block.addedToNotes) {
      get().removeFromNotes(id)
    } else {
      set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, addedToNotes: true } : b)) }))
    }
  },

  addAllSelectedToNotes: () => {
    const { selectedIds } = get()
    set((s) => ({ blocks: s.blocks.map((b) => (selectedIds.has(b.id) ? { ...b, addedToNotes: true } : b)) }))
  },

  addAllTranscriptToNotes: () => {
    set((s) => ({ blocks: s.blocks.map((b) => (b.type === 'transcript' ? { ...b, addedToNotes: true } : b)) }))
  },

  /**
   * Edit a note block:
   * - For transcript blocks, stores the edit as `noteOverride` — the original `text` stays untouched.
   * - For manual blocks, updates `text` directly.
   */
  setNoteOverride: (id, override) =>
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== id) return b
        if (b.type === 'transcript') return { ...b, noteOverride: override }
        return { ...b, text: override }
      }),
    })),

  clearNoteOverride: (id) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, noteOverride: null } : b)),
    })),

  // ── Selection ─────────────────────────────────────────────────────────────
  toggleSelect: (id) => {
    const { selectedIds } = get()
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    set({ selectedIds: next, rangeAnchorId: id })
  },

  selectRange: (toId) => {
    const { blocks, rangeAnchorId, selectedIds } = get()
    if (!rangeAnchorId) { set({ selectedIds: new Set([toId]), rangeAnchorId: toId }); return }
    const tBlocks = blocks.filter((b) => b.type === 'transcript')
    const fromIdx = tBlocks.findIndex((b) => b.id === rangeAnchorId)
    const toIdx   = tBlocks.findIndex((b) => b.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
    const next = new Set(selectedIds)
    tBlocks.slice(lo, hi + 1).forEach((b) => next.add(b.id))
    set({ selectedIds: next })
  },

  clearSelection: () => set({ selectedIds: new Set(), rangeAnchorId: null }),

  getSelectedText: () => {
    const { blocks, selectedIds } = get()
    return blocks.filter((b) => selectedIds.has(b.id) && b.type === 'transcript').map((b) => b.text).join('\n')
  },

  // ── Export metadata ───────────────────────────────────────────────────────
  setExportTags: (tags) =>
    set((s) => ({
      exportMeta: { ...s.exportMeta, tags },
      usedTags: [...new Set([...s.usedTags, ...tags])],
    })),

  // ── UI ────────────────────────────────────────────────────────────────────
  setActiveTab: (activeTab) => set({ activeTab }),
  setScrollLocked: (scrollLocked) => set({ scrollLocked }),

  // ── Settings ─────────────────────────────────────────────────────────────
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  // ── Persistence ───────────────────────────────────────────────────────────
  getSerializedSession: () => {
    const { session, blocks, settings, exportMeta, usedTags } = get()
    return { session, blocks, settings, exportMeta, usedTags, savedAt: new Date().toISOString() }
  },

  loadSession: (saved) => {
    if (!saved) return
    set({
      session: { sources: {}, videoUrl: '', videoTitle: '', ...saved.session },
      blocks: saved.blocks ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
      exportMeta: saved.exportMeta ?? get().exportMeta,
      usedTags: saved.usedTags ?? get().usedTags,
    })
  },

  clearSession: () =>
    set({
      session: { id: uuidv4(), createdAt: new Date().toISOString(), sources: {}, videoUrl: '', videoTitle: '' },
      blocks: [],
      selectedIds: new Set(),
      transcription: { isActive: false, interimText: '', error: null },
      exportMeta: { tags: ['notes', 'course'], sourceUrls: [] },
    }),

  getNotesBlocks: () => get().blocks.filter((b) => b.addedToNotes),
}))
