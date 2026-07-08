import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

/**
 * NoteBlock shapes:
 *
 * Transcript: { id, type:'transcript', timestamp, text, addedToNotes, selected }
 * Screenshot: { id, type:'screenshot', timestamp, imageDataUrl, caption, anchoredToId, addedToNotes }
 * Heading:    { id, type:'heading', text, level }
 * Manual:     { id, type:'manual', text, addedToNotes }
 */

const DEFAULT_SETTINGS = {
  language: 'en-US',
  transcriptionMode: 'mic',      // 'mic' | 'tab'
  whisperApiKey: '',
  autoSaveInterval: 30,          // seconds
  autoAddScreenshotsToNotes: true,
  noteHeadingLevel: 'h2',
  screenshotQuality: 0.85,
}

export const useNotesStore = create((set, get) => ({
  // ── Session ──────────────────────────────────────────────────────────────
  session: {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    videoUrl: '',
    videoTitle: '',
  },

  // ── All blocks (ordered array — transcript + screenshots interleaved) ────
  blocks: [],

  // ── Live transcription state ─────────────────────────────────────────────
  transcription: {
    isActive: false,
    interimText: '',    // current unfinished sentence (shown as "typing")
    error: null,
  },

  // ── Selection (for multi-sentence copy) ──────────────────────────────────
  selectedIds: new Set(),
  rangeAnchorId: null,  // shift-click anchor

  // ── UI state ─────────────────────────────────────────────────────────────
  activeTab: 'transcript',
  scrollLocked: false,

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: DEFAULT_SETTINGS,

  // ── Session metadata ─────────────────────────────────────────────────────
  setVideoInfo: (url, title) =>
    set((s) => ({ session: { ...s.session, videoUrl: url, videoTitle: title } })),

  // ── Transcription controls ───────────────────────────────────────────────
  setTranscriptionActive: (isActive) =>
    set((s) => ({ transcription: { ...s.transcription, isActive, error: null } })),

  setInterimText: (interimText) =>
    set((s) => ({ transcription: { ...s.transcription, interimText } })),

  setTranscriptionError: (error) =>
    set((s) => ({ transcription: { ...s.transcription, error, isActive: false } })),

  // Commit a finalised sentence from the speech recogniser
  addTranscriptBlock: (text, timestamp) => {
    if (!text.trim()) return
    const block = {
      id: uuidv4(),
      type: 'transcript',
      timestamp: timestamp ?? null,
      text: text.trim(),
      addedToNotes: false,
      selected: false,
    }
    set((s) => ({
      blocks: [...s.blocks, block],
      transcription: { ...s.transcription, interimText: '' },
    }))
    return block.id
  },

  // ── Screenshots ──────────────────────────────────────────────────────────
  addScreenshotBlock: (imageDataUrl, videoTime) => {
    const { blocks, settings } = get()

    // Find the closest transcript block by timestamp to anchor to
    let anchoredToId = null
    if (videoTime !== null) {
      const transcriptBlocks = blocks.filter(
        (b) => b.type === 'transcript' && b.timestamp !== null
      )
      let closest = null
      let minDiff = Infinity
      for (const b of transcriptBlocks) {
        const diff = Math.abs(b.timestamp - videoTime)
        if (diff < minDiff) {
          minDiff = diff
          closest = b
        }
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
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, caption } : b)),
    })),

  deleteBlock: (id) =>
    set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),

  // ── Notes assembly ───────────────────────────────────────────────────────
  addToNotes: (id) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, addedToNotes: true } : b)),
    })),

  removeFromNotes: (id) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, addedToNotes: false } : b)),
    })),

  toggleInNotes: (id) => {
    const block = get().blocks.find((b) => b.id === id)
    if (!block) return
    set((s) => ({
      blocks: s.blocks.map((b) =>
        b.id === id ? { ...b, addedToNotes: !b.addedToNotes } : b
      ),
    }))
  },

  addAllSelectedToNotes: () => {
    const { selectedIds } = get()
    set((s) => ({
      blocks: s.blocks.map((b) =>
        selectedIds.has(b.id) ? { ...b, addedToNotes: true } : b
      ),
    }))
  },

  // ── Selection ────────────────────────────────────────────────────────────
  toggleSelect: (id) => {
    const { selectedIds } = get()
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    set({ selectedIds: next, rangeAnchorId: id })
  },

  // Shift-click: select a range of transcript blocks between anchor and target
  selectRange: (toId) => {
    const { blocks, rangeAnchorId, selectedIds } = get()
    if (!rangeAnchorId) {
      set({ selectedIds: new Set([toId]), rangeAnchorId: toId })
      return
    }
    const transcriptBlocks = blocks.filter((b) => b.type === 'transcript')
    const fromIdx = transcriptBlocks.findIndex((b) => b.id === rangeAnchorId)
    const toIdx = transcriptBlocks.findIndex((b) => b.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
    const next = new Set(selectedIds)
    transcriptBlocks.slice(lo, hi + 1).forEach((b) => next.add(b.id))
    set({ selectedIds: next })
  },

  clearSelection: () => set({ selectedIds: new Set(), rangeAnchorId: null }),

  getSelectedText: () => {
    const { blocks, selectedIds } = get()
    return blocks
      .filter((b) => selectedIds.has(b.id) && b.type === 'transcript')
      .map((b) => b.text)
      .join('\n')
  },

  // ── Notes blocks (headings, manual text) ─────────────────────────────────
  addHeading: (text, level = 'h2') => {
    const block = { id: uuidv4(), type: 'heading', text, level, addedToNotes: true }
    set((s) => ({ blocks: [...s.blocks, block] }))
  },

  // ── UI ────────────────────────────────────────────────────────────────────
  setActiveTab: (activeTab) => set({ activeTab }),
  setScrollLocked: (scrollLocked) => set({ scrollLocked }),

  // ── Settings ─────────────────────────────────────────────────────────────
  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),

  // ── Persistence ──────────────────────────────────────────────────────────
  getSerializedSession: () => {
    const { session, blocks, settings } = get()
    // Don't store image data in base64 during normal auto-save
    // (screenshots are stored as-is since storage.local allows ~10MB)
    return { session, blocks, settings, savedAt: new Date().toISOString() }
  },

  loadSession: (saved) => {
    if (!saved) return
    set({
      session: saved.session ?? get().session,
      blocks: saved.blocks ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
    })
  },

  clearSession: () =>
    set({
      session: { id: uuidv4(), createdAt: new Date().toISOString(), videoUrl: '', videoTitle: '' },
      blocks: [],
      selectedIds: new Set(),
      transcription: { isActive: false, interimText: '', error: null },
    }),

  // Get only the blocks marked for notes, in the correct contextual order
  getNotesBlocks: () => {
    const { blocks } = get()
    return blocks.filter((b) => b.addedToNotes)
  },
}))
