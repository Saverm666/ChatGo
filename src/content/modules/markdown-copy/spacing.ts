// Turndown 输出后的收尾清理，负责统一空行、行尾空白和简单列表间距。

type MarkdownListLineInfo = {
  indent: number
  quoteDepth: number
}

function parseMarkdownListLine(line: string): MarkdownListLineInfo | null {
  const match = line.match(/^(?<quotes>(?:\s*>[ \t]*)*)(?<indent>\s*)(?:[-*+]|\d+\.)\s+/)
  if (!match?.groups) return null

  const quotes = match.groups.quotes ?? ''
  const indent = match.groups.indent ?? ''
  return {
    indent: indent.length,
    quoteDepth: (quotes.match(/>/g) ?? []).length
  }
}

function shouldCollapseSimpleListGap(previous: string, next: string): boolean {
  const previousInfo = parseMarkdownListLine(previous)
  const nextInfo = parseMarkdownListLine(next)
  if (!previousInfo || !nextInfo) return false
  if (previousInfo.quoteDepth !== nextInfo.quoteDepth) return false
  return true
}

export function cleanupMarkdownSpacing(markdown: string): string {
  const normalized = String(markdown ?? '')
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const lines = normalized.split('\n')
  let inCodeBlock = false
  return lines
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock
        return trimmed
      }
      if (inCodeBlock) return line.replace(/[ \t]+$/g, '')
      if (!trimmed) return ''
      if (/^\s*(?:>|- |\* |\d+\. )/.test(line)) return line.replace(/[ \t]+$/g, '')
      return trimmed
    })
    .filter((line, index, allLines) => {
      if (line !== '') return true

      let previous = ''
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (!allLines[cursor].trim()) continue
        previous = allLines[cursor]
        break
      }

      let next = ''
      for (let cursor = index + 1; cursor < allLines.length; cursor += 1) {
        if (!allLines[cursor].trim()) continue
        next = allLines[cursor]
        break
      }

      return !shouldCollapseSimpleListGap(previous, next)
    })
    .join('\n')
    .trim()
}
