import JSZip from 'jszip'

/**
 * Format seconds → MM:SS or HH:MM:SS
 */
export function formatTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Build the text content of a block for the notes markdown output.
 * For transcript blocks, respects `noteOverride` if set.
 */
function blockNoteText(block) {
  if (block.type === 'transcript') return block.noteOverride ?? block.text
  return block.text ?? ''
}

/**
 * Build Obsidian-ready Markdown.
 *
 * @param {object} session  — { videoTitle, videoUrl, createdAt, sourceUrls? }
 * @param {Array}  blocks   — notesBlocks
 * @param {object} settings — { exportTags? }
 * @param {object} exportMeta — optional { sourceUrls, tags }
 */
export function buildMarkdown(session, blocks, settings, exportMeta) {
  const date  = new Date(session.createdAt).toISOString().split('T')[0]
  const title = session.videoTitle || 'Course Notes'
  const tags  = (settings.exportTags?.length > 0) ? settings.exportTags.join(', ') : 'notes, course'

  // Gather source URLs — prefer exportMeta.sourceUrls, fall back to session.videoUrl
  const sourceUrls = exportMeta?.sourceUrls ?? session.sourceUrls ?? []
  const primarySource = sourceUrls[0]?.url || session.videoUrl || ''
  const extraSources  = sourceUrls.slice(1).map((s) => s.url)

  const frontmatterLines = [
    '---',
    `title: "${title}"`,
    `date: ${date}`,
    `tags: [${tags}]`,
    primarySource ? `source: "${primarySource}"` : '',
    ...extraSources.map((u) => `source_extra: "${u}"`),
    '---',
  ].filter(Boolean)

  const frontmatter = frontmatterLines.join('\n')
  const header = `\n# ${title}\n`

  const body = blocks.map((block) => {
    switch (block.type) {
      case 'transcript': {
        const text = blockNoteText(block)
        const ts   = block.timestamp !== null ? `> [${formatTime(block.timestamp)}] ` : ''
        // If user edited, add a comment showing original
        const editNote = block.noteOverride != null
          ? `\n<!-- original: ${block.text} -->`
          : ''
        return `${ts}${text}${editNote}`
      }
      case 'screenshot': {
        const filename = `screenshot-${block.id.slice(0, 8)}.png`
        const caption  = block.caption ? `\n*${block.caption}*` : ''
        const ts       = block.timestamp !== null ? ` — at ${formatTime(block.timestamp)}` : ''
        return `\n![Screenshot${ts}](./assets/${filename})${caption}\n`
      }
      case 'heading': {
        const lvl = block.level === 'h1' ? '#' : block.level === 'h3' ? '###' : '##'
        return `\n${lvl} ${block.text}\n`
      }
      case 'manual':
        return block.text
      default:
        return ''
    }
  }).join('\n\n')

  return `${frontmatter}${header}\n${body}\n`
}

/**
 * Build plain-text transcript.
 */
export function buildTranscriptText(blocks) {
  return blocks
    .filter((b) => b.type === 'transcript')
    .map((b) => {
      const ts = b.timestamp !== null ? `[${formatTime(b.timestamp)}] ` : ''
      return `${ts}${b.text}`
    })
    .join('\n\n')
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

export async function downloadNotesZip(session, blocks, settings, allBlocks = [], exportMeta) {
  const zip = new JSZip()
  zip.file('notes.md', buildMarkdown(session, blocks, settings, exportMeta))
  if (allBlocks.length > 0) {
    const txt = buildTranscriptText(allBlocks)
    if (txt) zip.file('transcript.txt', txt)
  }
  const screenshots = blocks.filter((b) => b.type === 'screenshot')
  if (screenshots.length > 0) {
    const assets = zip.folder('assets')
    for (const block of screenshots) {
      assets.file(`screenshot-${block.id.slice(0, 8)}.png`, dataUrlToUint8Array(block.imageDataUrl))
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(session.videoTitle || 'notes').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTranscript(session, blocks) {
  const text = buildTranscriptText(blocks)
  const blob = new Blob([text], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${(session.videoTitle || 'transcript').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyMarkdownToClipboard(session, blocks, settings, exportMeta) {
  let markdown = buildMarkdown(session, blocks, settings, exportMeta)
  for (const block of blocks.filter((b) => b.type === 'screenshot')) {
    const filename = `screenshot-${block.id.slice(0, 8)}.png`
    markdown = markdown.replace(`./assets/${filename}`, block.imageDataUrl)
  }
  await navigator.clipboard.writeText(markdown)
}
