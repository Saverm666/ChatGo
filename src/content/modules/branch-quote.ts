// 把框选 Markdown 转成标准引用，并在末尾保留两个换行供用户继续输入。
export function formatBranchQuotedMarkdown(markdown: string): string {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const quoted = normalized
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
  return `${quoted}\n\n`
}
