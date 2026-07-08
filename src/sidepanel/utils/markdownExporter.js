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
 * Build Obsidian-ready Markdown from the notes blocks.
 * Screenshots are referenced as relative paths: ./assets/screenshot-<id>.png
 *
 * @param {object} session  - { videoTitle, videoUrl, createdAt }
 * @param {Array}  blocks   - filtered notesBlocks
 * @param {object} settings - { noteHeadingLevel }
 * @returns {string} markdown string
 */
export function buildMarkdown(session, blocks, settings) {
  const headingChar = settings.noteHeadingLevel === 'h1' ? '#'
    : settings.noteHeadingLevel === 'h3' ? '###'
    : '##'

  const date = new Date(session.createdAt).toISOString().split('T')[0]
  const title = session.videoTitle || 'Course Notes'

  const frontmatter = [
    '---',
    `title: "${title}"`,
    `date: ${date}`,
    `tags: [notes, course]`,
    session.videoUrl ? `source: "${session.videoUrl}"` : '',
    '---',
  ].filter(Boolean).join('\n')

  const header = `\n# ${title}\n`

  const body = blocks.map((block) => {
    switch (block.type) {
      case 'transcript': {
        const ts = block.timestamp !== null ? `> [${formatTime(block.timestamp)}] ` : ''
        return `${ts}${block.text}`
      }
      case 'screenshot': {
        const filename = `screenshot-${block.id.slice(0, 8)}.png`
        const caption = block.caption ? `\n*${block.caption}*` : ''
        const ts = block.timestamp !== null ? ` — at ${formatTime(block.timestamp)}` : ''
        return `\n![Screenshot${ts}](./assets/${filename})${caption}\n`
      }
      case 'heading': {
        const lvl = block.level === 'h1' ? '#' : block.level === 'h3' ? '###' : '##'
        return `\n${lvl} ${block.text}\n`
      }
      case 'manual': {
        return block.text
      }
      default:
        return ''
    }
  }).join('\n\n')

  return `${frontmatter}${header}\n${body}\n`
}

/**
 * Build a plain-text transcript from all transcript blocks.
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

/**
 * Convert a base64 data URL to a Uint8Array suitable for JSZip.
 */
function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

/**
 * Create and download a ZIP containing notes.md + assets/*.png
 *
 * @param {object} session
 * @param {Array}  blocks    - all notesBlocks
 * @param {object} settings
 */
export async function downloadNotesZip(session, blocks, settings) {
  const zip = new JSZip()
  const markdown = buildMarkdown(session, blocks, settings)
  zip.file('notes.md', markdown)

  const screenshots = blocks.filter((b) => b.type === 'screenshot')
  if (screenshots.length > 0) {
    const assetsFolder = zip.folder('assets')
    for (const block of screenshots) {
      const filename = `screenshot-${block.id.slice(0, 8)}.png`
      assetsFolder.file(filename, dataUrlToUint8Array(block.imageDataUrl))
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = (session.videoTitle || 'notes').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  a.href = url
  a.download = `${safeName}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Download only the plain text transcript.
 */
export function downloadTranscript(session, blocks) {
  const text = buildTranscriptText(blocks)
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = (session.videoTitle || 'transcript').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  a.href = url
  a.download = `${safeName}_transcript.txt`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Copy Markdown to clipboard (screenshots as inline base64).
 */
export async function copyMarkdownToClipboard(session, blocks, settings) {
  // For clipboard, embed screenshots as base64 inline
  const inlineBlocks = blocks.map((b) =>
    b.type === 'screenshot'
      ? { ...b, _inline: true }
      : b
  )

  const md = blocks.map((block) => {
    if (block.type === 'screenshot') {
      const caption = block.caption ? `\n*${block.caption}*` : ''
      const ts = block.timestamp !== null ? ` — at ${formatTime(block.timestamp)}` : ''
      return `\n![Screenshot${ts}](${block.imageDataUrl})${caption}\n`
    }
    return null
  })

  // Use the regular builder but replace screenshot paths with base64
  let markdown = buildMarkdown(session, inlineBlocks, settings)
  for (const block of blocks.filter((b) => b.type === 'screenshot')) {
    const filename = `screenshot-${block.id.slice(0, 8)}.png`
    markdown = markdown.replace(`./assets/${filename}`, block.imageDataUrl)
  }

  await navigator.clipboard.writeText(markdown)
}
