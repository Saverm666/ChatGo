// Markdown 复制专用 Turndown 规则，集中处理表格、公式、任务清单等站点渲染后的 HTML。

import TurndownService from 'turndown'
import { tables } from '@truto/turndown-plugin-gfm'
import { formatTaskListCheckboxMarker } from '../task-list-marker'
import { buildTableSeparatorRow, type ColumnAlign } from '../table-separator'
import {
  FORMULA_DISPLAY_ATTR,
  FORMULA_MARKDOWN_ATTR,
  FORMULA_MARK_ID_ATTR
} from './constants'

function getRowCells(row: Element): Element[] {
  return Array.from(row.childNodes).filter(
    (node): node is Element =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node.nodeName === 'TH' || node.nodeName === 'TD')
  )
}

function isHeadingRow(row: Element): boolean {
  const parent = row.parentElement
  if (!parent) return false
  if (parent.nodeName === 'THEAD') return true
  if (parent.firstChild !== row) return false
  if (parent.nodeName !== 'TABLE' && parent.nodeName !== 'TBODY') return false
  const cells = getRowCells(row)
  return cells.length > 0 && cells.every((cell) => cell.nodeName === 'TH')
}

function readTextAlign(element: Element): ColumnAlign {
  const style = element.getAttribute('style') ?? ''
  const match = style.match(/text-align\s*:\s*(left|center|right)\b/i)
  return (match?.[1]?.toLowerCase() as ColumnAlign) ?? null
}

function getHeadingAlignments(row: Element, colCount: number): ColumnAlign[] {
  const alignments: ColumnAlign[] = []
  for (const cell of getRowCells(row)) {
    const align = readTextAlign(cell)
    const colspan = Number.parseInt(cell.getAttribute('colspan') ?? '1', 10)
    const span = Number.isFinite(colspan) && colspan > 0 ? colspan : 1
    alignments.push(align)
    for (let i = 1; i < span; i += 1) alignments.push(null)
  }
  while (alignments.length < colCount) alignments.push(null)
  return alignments.slice(0, colCount)
}

function shouldSkipTable(table: Element): boolean {
  const rows = (table as HTMLTableElement).rows
  if (!rows || rows.length === 0) return true
  let totalCells = 0
  let contentCells = 0
  for (const row of Array.from(rows)) {
    for (const cell of getRowCells(row)) {
      totalCells += 1
      if (cell.textContent?.trim()) contentCells += 1
    }
  }
  if (totalCells === 0) return true
  return totalCells === 1 && contentCells === 0
}

function countPipeColumns(line: string): number {
  return Math.max((line.match(/\|/g) ?? []).length - 1, 0)
}

export function createMarkdownTurndownService(): TurndownService {
  const seenFormulaMarks = new Set<string>()
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })

  // AI 输出里 LaTeX 和普通 Markdown 片段混排很多，Turndown 默认 escape 会破坏公式源码。
  service.escape = (value) => value
  service.use(tables)
  service.remove(['script', 'style', 'noscript'])
  service.addRule('tableRow', {
    filter: 'tr',
    replacement: (content, node) => {
      if (!content || !content.trim()) return ''
      const row = node as Element
      let borderCells = ''
      if (isHeadingRow(row)) {
        const colCount = countPipeColumns(content)
        if (colCount > 0) {
          borderCells = buildTableSeparatorRow(getHeadingAlignments(row, colCount))
        }
      }
      return `\n${content}${borderCells ? `\n${borderCells}` : ''}`
    }
  })
  service.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      if (shouldSkipTable(node as Element)) return ''
      const normalized = content.replace(/\n+/g, '\n').trim()
      if (!normalized) return ''
      const lines = normalized.split('\n').filter((line) => line.trim())
      if (lines.length === 0) return ''
      const hasHeaderSeparator =
        lines.length >= 2 && /\|\s*:?-+:?\s*\|/.test(lines[1])
      let result = lines.join('\n')
      if (!hasHeaderSeparator) {
        const colCount = countPipeColumns(lines[0])
        if (colCount > 0) {
          const separator = buildTableSeparatorRow(new Array(colCount).fill(null))
          result = [lines[0], separator, ...lines.slice(1)].join('\n')
        }
      }
      return `\n\n${result}\n\n`
    }
  })
  service.addRule('chatgoFormula', {
    filter: (node) => node instanceof HTMLElement && node.hasAttribute(FORMULA_MARKDOWN_ATTR),
    replacement: (_content, node) => {
      const markdown = node.getAttribute(FORMULA_MARKDOWN_ATTR) ?? ''
      if (!markdown) return ''
      const id = node.getAttribute(FORMULA_MARK_ID_ATTR)
      if (id) {
        if (seenFormulaMarks.has(id)) return ''
        seenFormulaMarks.add(id)
      }
      return node.getAttribute(FORMULA_DISPLAY_ATTR) === '1' ? `\n\n${markdown}\n\n` : markdown
    }
  })
  service.addRule('singleParagraphInListItem', {
    filter: (node) => {
      const parent = node.parentElement
      return node.nodeName === 'P' && parent?.nodeName === 'LI' && parent.childElementCount === 1
    },
    replacement: (content) => content
  })
  service.addRule('strikethrough', {
    filter: (node) => node.nodeName === 'DEL' || node.nodeName === 'S' || node.nodeName === 'STRIKE',
    replacement: (content) => content ? `~~${content}~~` : ''
  })
  service.addRule('chatgoTaskCheckbox', {
    filter: (node) => {
      if (node.nodeName !== 'INPUT') return false
      const input = node as HTMLInputElement
      return input.type === 'checkbox' && Boolean(input.parentElement?.closest('li'))
    },
    replacement: (_content, node) => {
      const input = node as HTMLInputElement
      const next = node.nextSibling
      return formatTaskListCheckboxMarker({
        checked: input.hasAttribute('checked') || input.checked,
        followingStartsWithSpace:
          next?.nodeType === Node.TEXT_NODE && /^\s/.test(next.textContent ?? '')
      })
    }
  })
  service.addRule('subscript', {
    filter: 'sub',
    replacement: (content) => content ? `<sub>${content}</sub>` : ''
  })
  service.addRule('superscript', {
    filter: 'sup',
    replacement: (content) => content ? `<sup>${content}</sup>` : ''
  })

  return service
}
