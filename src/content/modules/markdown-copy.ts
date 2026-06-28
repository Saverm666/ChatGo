// 选区复制为 Markdown 模块
// 移植自 ChatGPT-Voyager markdownCopyModule 的 DOM→Markdown 序列化

import type { MarkdownFormulaWrapMode } from '@/main/types'
import { readSettings } from '@/main/storage'
import { normalizeMarkdownFormulaWrapMode } from '@/main/utils'
import { isFormulaElement, isDisplayFormula, extractLatexSource } from './formula-source'

let enabled = false
let formulaWrapMode: MarkdownFormulaWrapMode = 'with-delimiters'
let lastCopyPayload = ''

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul'
])

function isEditableTarget(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement ?? null
  if (!el) return false
  return Boolean(
    el.closest("input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']")
  )
}

function shouldSkipInvisible(element: Element): boolean {
  if (element.closest('.chatgo-formula-feedback, .chatgo-floating-root, .chatgo-branch-root')) {
    return true
  }
  if (element.getAttribute('aria-hidden') === 'true' && !element.closest('.katex, .katex-display, mjx-container')) {
    return true
  }
  return element.hasAttribute('hidden')
}

function normalizeInlineText(text: string): string {
  return String(text ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ')
}

function escapeMarkdownLinkText(text: string): string {
  return String(text ?? '').replace(/]/g, '\\]')
}

function formatInlineCode(text: string): string {
  const content = String(text ?? '').replace(/\n+$/g, '')
  const fence = content.includes('`') ? '``' : '`'
  return `${fence}${content}${fence}`
}

function cleanupMarkdownSpacing(markdown: string): string {
  const normalized = String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .replace(/([^\n ])  +([^\n])/g, '$1 $2')
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
      if (/^(?:>|- |\* |\d+\. )/.test(trimmed)) return trimmed
      return trimmed
    })
    .join('\n')
    .trim()
}

function rangeIntersectsNode(node: Node, range: Range): boolean {
  try {
    return range.intersectsNode(node)
  } catch {
    return false
  }
}

function getSelectedTextNodeText(textNode: Text, range: Range): string {
  const raw = String(textNode.textContent ?? '')
  let start = 0
  let end = raw.length
  if (textNode === range.startContainer) start = Math.max(0, range.startOffset)
  if (textNode === range.endContainer) end = Math.min(raw.length, range.endOffset)
  if (textNode === range.startContainer && textNode === range.endContainer) {
    start = Math.max(0, Math.min(range.startOffset, raw.length))
    end = Math.max(start, Math.min(range.endOffset, raw.length))
  }
  return raw.slice(start, end)
}

function getFormulaMarkdown(element: Element): string {
  const latex = extractLatexSource(element)
  if (!latex) return ''
  if (formulaWrapMode === 'bare') return latex
  return isDisplayFormula(element) ? `$$${latex}$$` : `$${latex}$`
}

// 递归序列化节点为 Markdown
function serializeNode(node: Node, range: Range, context: { preserveWhitespace: boolean }): string {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!rangeIntersectsNode(node, range)) return ''
    const text = getSelectedTextNodeText(node as Text, range)
    return context.preserveWhitespace ? text : normalizeInlineText(text)
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  if (shouldSkipInvisible(el)) return ''
  if (isFormulaElement(el)) {
    if (!rangeIntersectsNode(el, range)) return ''
    return getFormulaMarkdown(el)
  }

  const tag = el.tagName.toLowerCase()
  const childContext = { preserveWhitespace: tag === 'pre' || tag === 'code' }
  const children = Array.from(el.childNodes)
    .map((child) => serializeNode(child, range, childContext))
    .join('')
  const trimmed = children.trim()

  switch (tag) {
    case 'h1': return `# ${trimmed}\n\n`
    case 'h2': return `## ${trimmed}\n\n`
    case 'h3': return `### ${trimmed}\n\n`
    case 'h4': return `#### ${trimmed}\n\n`
    case 'h5': return `##### ${trimmed}\n\n`
    case 'h6': return `###### ${trimmed}\n\n`
    case 'p': return `${trimmed}\n\n`
    case 'br': return '\n'
    case 'hr': return '---\n\n'
    case 'strong':
    case 'b': return trimmed ? `**${trimmed}**` : ''
    case 'em':
    case 'i': return trimmed ? `*${trimmed}*` : ''
    case 'code': return formatInlineCode(trimmed || (el.textContent ?? ''))
    case 'pre': {
      const code = el.textContent ?? ''
      const lang = el.querySelector('code')?.className?.match(/language-([\w-]+)/)?.[1] ?? ''
      return `\`\`\`${lang}\n${code.replace(/\n+$/, '')}\n\`\`\`\n\n`
    }
    case 'blockquote': return trimmed.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n'
    case 'ul':
      return children
        .split('\n')
        .filter(Boolean)
        .map((l) => `- ${l}`)
        .join('\n') + '\n\n'
    case 'ol': {
      const items = children.split('\n').filter(Boolean)
      return items.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n\n'
    }
    case 'li': return `${trimmed}\n`
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      return href ? `[${escapeMarkdownLinkText(trimmed || (el.textContent ?? ''))}](${href})` : trimmed
    }
    default:
      if (BLOCK_TAGS.has(tag)) return `${trimmed}\n\n`
      return children
  }
}

function getSelectionMarkdown(): string {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return ''
  const range = selection.getRangeAt(0)
  if (isEditableTarget(range.commonAncestorContainer)) return ''
  const root = range.commonAncestorContainer
  const container = root instanceof Element ? root : root.parentElement
  if (!container) return ''
  const markdown = Array.from(container.childNodes)
    .map((child) => serializeNode(child, range, { preserveWhitespace: false }))
    .join('')
  return cleanupMarkdownSpacing(markdown)
}

function onCopy(event: ClipboardEvent): void {
  if (!enabled) return
  const markdown = getSelectionMarkdown()
  if (!markdown) return
  lastCopyPayload = markdown
  event.preventDefault()
  event.clipboardData?.setData('text/plain', markdown)
}

export const markdownCopy = {
  setFormulaWrapMode(mode: MarkdownFormulaWrapMode): void {
    formulaWrapMode = normalizeMarkdownFormulaWrapMode(mode)
  },

  enable(): void {
    if (enabled) return
    enabled = true
    document.addEventListener('copy', onCopy, true)
    console.log('[ChatGo] Markdown 复制已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    document.removeEventListener('copy', onCopy, true)
    console.log('[ChatGo] Markdown 复制已关闭。')
  },

  async syncSettings(): Promise<void> {
    const settings = await readSettings()
    formulaWrapMode = settings.markdownFormulaWrapMode
  },

  getSelectionMarkdown(): string {
    return getSelectionMarkdown()
  },

  getLastCopyPayload(): string {
    return lastCopyPayload
  }
}
