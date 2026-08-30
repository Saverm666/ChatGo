import katex from 'katex'

export function renderFormulaPreview(source: string): string {
  if (!source) return ''
  try {
    return katex.renderToString(source, {
      displayMode: true,
      throwOnError: false,
      output: 'html'
    })
  } catch {
    return escapeHtml(source)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
