export function highlightedParts(text, highlights = []) {
  const parts = []
  let cursor = 0
  for (const range of highlights) {
    const start = Math.max(cursor, Math.min(text.length, range.start))
    const end = Math.max(start, Math.min(text.length, range.end))
    if (start > cursor) parts.push({ highlighted: false, text: text.slice(cursor, start) })
    if (end > start) parts.push({ highlighted: true, text: text.slice(start, end) })
    cursor = end
  }
  if (cursor < text.length) parts.push({ highlighted: false, text: text.slice(cursor) })
  return parts
}
