export type ColumnAlign = 'left' | 'center' | 'right' | null

export function formatTableSeparatorCell(align: ColumnAlign): string {
  switch (align) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    default:
      return '---'
  }
}

export function buildTableSeparatorRow(alignments: ColumnAlign[]): string {
  if (alignments.length === 0) return '| |'
  const cells = alignments.map(formatTableSeparatorCell)
  return `| ${cells.join(' | ')} |`
}
