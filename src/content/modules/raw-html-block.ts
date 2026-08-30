const RAW_HTML_BLOCK_TAGS = ['details', 'summary'] as const

function buildTagPattern(): RegExp {
  const tags = RAW_HTML_BLOCK_TAGS.join('|')
  return new RegExp(`</?(?:${tags})\\b`, 'i')
}

function isCodeLine(line: string, inFencedCode: boolean): boolean {
  if (inFencedCode) return true
  return /^(?: {4,}|\t)/.test(line)
}

export function normalizeRawHtmlBlockLines(markdown: string): string {
  const tagPattern = buildTagPattern()
  const lines = markdown.split('\n')
  let inFencedCode = false
  const result: string[] = []

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFencedCode = !inFencedCode
      result.push(line)
      continue
    }
    if (isCodeLine(line, inFencedCode) || !tagPattern.test(line)) {
      result.push(line)
      continue
    }

    let processed = line
    processed = processed.replace(/(<details>)\s*(?=\S)/g, '$1\n')
    processed = processed.replace(/(?<=\S)\s*(<\/details>)/g, '\n$1')

    if (processed !== line) {
      result.push(...processed.split('\n'))
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}
