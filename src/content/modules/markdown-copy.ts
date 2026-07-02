// 选区复制为 Markdown 模块

import type { MarkdownFormulaWrapMode, SiteAdapter } from '@/main/types'
import { readSettings } from '@/main/storage'
import { normalizeMarkdownFormulaWrapMode } from '@/main/utils'
import TurndownService from 'turndown'
import { tables } from '@truto/turndown-plugin-gfm'
import { isDisplayFormula, extractLatexSource } from './formula-source'

let enabled = false
let formulaWrapMode: MarkdownFormulaWrapMode = 'with-delimiters'
let lastCopyPayload = ''
let formulaMarkId = 0
let currentAdapter: SiteAdapter | null = null

const FORMULA_SELECTOR = ".katex, .katex-display, .katex-mathml, mjx-container, math, [role='math'], cib-math"
const FORMULA_MARKDOWN_ATTR = 'data-chatgo-formula-markdown'
const FORMULA_MARK_ID_ATTR = 'data-chatgo-formula-mark-id'
const FORMULA_DISPLAY_ATTR = 'data-chatgo-formula-display'
const LIST_PARENT_ATTR = 'data-chatgo-list-parent'
const LIST_START_ATTR = 'data-chatgo-list-start'

function isEditableTarget(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement ?? null
  if (!el) return false
  return Boolean(
    el.closest("input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']")
  )
}

function isCopyControlElement(element: Element): boolean {
  const control = element.closest('button, [role="button"], [data-testid], [aria-label]')
  if (!(control instanceof Element)) return false
  const label = control.getAttribute('aria-label') ?? ''
  const testId = control.getAttribute('data-testid') ?? ''
  return /copy|复制/i.test(label) || /copy/i.test(testId)
}

function isCopyControlEvent(event: ClipboardEvent): boolean {
  return event.composedPath().some((item) => item instanceof Element && isCopyControlElement(item))
}

function getElementFromNode(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null
}

function shouldSkipInvisible(element: Element): boolean {
  if (
    element.closest(
      '.chatgo-formula-feedback, .chatgo-floating-root, .chatgo-branch-root, .cm-content.q9tKkq_readonly'
    )
  ) {
    return true
  }
  if (element.closest('button, [role="button"], [aria-label*="复制"], [aria-label*="Copy" i]')) return true
  if (element.getAttribute('aria-hidden') === 'true' && !element.closest('.katex, .katex-display, mjx-container')) {
    return true
  }
  return element.hasAttribute('hidden')
}

function cleanupMarkdownSpacing(markdown: string): string {
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

function compareBoundary(range: Range, how: number, sourceRange: Range): number {
  try {
    return range.compareBoundaryPoints(how, sourceRange)
  } catch {
    return 0
  }
}

function getActiveSelectionRange(): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (
    isEditableTarget(range.startContainer) ||
    isEditableTarget(range.endContainer) ||
    isEditableTarget(range.commonAncestorContainer)
  ) {
    return null
  }
  return range
}

function queryClosest(node: Node | null, selector: string | undefined): Element | null {
  if (!selector) return null
  return getElementFromNode(node)?.closest(selector) ?? null
}

function isAssistantRoot(element: Element | null): boolean {
  const selector = currentAdapter?.selectors.assistantMessage
  return Boolean(element && selector && element.matches(selector))
}

function getClosestAssistantMessage(node: Node | null): Element | null {
  const selector = currentAdapter?.selectors.assistantMessage
  if (!selector) return null
  const candidate = queryClosest(node, selector)
  if (!candidate) return null

  const userSelector = currentAdapter?.selectors.userMessage
  if (userSelector && candidate.closest(userSelector)) return null
  return candidate
}

function getSelectionRoot(range: Range): Element | null {
  if (!currentAdapter || currentAdapter.id === 'generic') return null

  const startMessage = getClosestAssistantMessage(range.startContainer)
  const endMessage = getClosestAssistantMessage(range.endContainer)
  if (startMessage && startMessage === endMessage) return startMessage

  const turnSelector = currentAdapter.selectors.messageTurn
  const assistantSelector = currentAdapter.selectors.assistantMessage
  if (!turnSelector || !assistantSelector) return null

  const startTurn = queryClosest(range.startContainer, turnSelector)
  const endTurn = queryClosest(range.endContainer, turnSelector)
  if (!startTurn || startTurn !== endTurn) return null

  const assistant = isAssistantRoot(startTurn)
    ? startTurn
    : startTurn.querySelector(assistantSelector)
  if (!(assistant instanceof Element)) return null

  const userSelector = currentAdapter.selectors.userMessage
  if (userSelector && assistant.matches(userSelector)) return null
  return assistant
}

function formatFormulaMarkdown(latex: string, display: boolean): string {
  if (formulaWrapMode === 'bare') return latex
  return display ? `$$${latex}$$` : `$${latex}$`
}

function getClosestFormulaElement(node: Node | null): Element | null {
  const el = node instanceof Element ? node : node?.parentElement ?? null
  return el?.closest(FORMULA_SELECTOR) ?? null
}

function markSelectedFormulas(range: Range): Array<() => void> {
  const root = range.commonAncestorContainer
  const scope = root instanceof Element ? root : root.parentElement
  const candidates = new Set<Element>()
  scope?.querySelectorAll(FORMULA_SELECTOR).forEach((el) => candidates.add(el))
  ;[range.startContainer, range.endContainer, range.commonAncestorContainer].forEach((node) => {
    const formula = getClosestFormulaElement(node)
    if (formula) candidates.add(formula)
  })

  const cleanup: Array<() => void> = []
  candidates.forEach((formula) => {
    if (!rangeIntersectsNode(formula, range)) return
    const latex = extractLatexSource(formula)
    if (!latex) return
    const display = isDisplayFormula(formula)
    const markdown = formatFormulaMarkdown(latex, display)
    const id = `${++formulaMarkId}`
    const targets = [formula, ...Array.from(formula.querySelectorAll('*'))]
    targets.forEach((target) => {
      const previousMarkdown = target.getAttribute(FORMULA_MARKDOWN_ATTR)
      const previousId = target.getAttribute(FORMULA_MARK_ID_ATTR)
      const previousDisplay = target.getAttribute(FORMULA_DISPLAY_ATTR)
      target.setAttribute(FORMULA_MARKDOWN_ATTR, markdown)
      target.setAttribute(FORMULA_MARK_ID_ATTR, id)
      target.setAttribute(FORMULA_DISPLAY_ATTR, display ? '1' : '0')
      cleanup.push(() => {
        if (previousMarkdown === null) {
          target.removeAttribute(FORMULA_MARKDOWN_ATTR)
        } else {
          target.setAttribute(FORMULA_MARKDOWN_ATTR, previousMarkdown)
        }
        if (previousId === null) {
          target.removeAttribute(FORMULA_MARK_ID_ATTR)
        } else {
          target.setAttribute(FORMULA_MARK_ID_ATTR, previousId)
        }
        if (previousDisplay === null) {
          target.removeAttribute(FORMULA_DISPLAY_ATTR)
        } else {
          target.setAttribute(FORMULA_DISPLAY_ATTR, previousDisplay)
        }
      })
    })
  })
  return cleanup
}

function getClosestListItem(node: Node | null): HTMLLIElement | null {
  const el = node instanceof Element ? node : node?.parentElement ?? null
  return el?.closest('li') ?? null
}

function isListElement(element: Element | null): element is HTMLOListElement | HTMLUListElement {
  return element instanceof HTMLOListElement || element instanceof HTMLUListElement
}

function getListItemStart(listItem: HTMLLIElement): number {
  const parent = listItem.parentElement
  if (!(parent instanceof HTMLOListElement)) return 1

  const start = Number(parent.getAttribute('start') ?? '1')
  const siblings = Array.from(parent.children).filter((child) => child instanceof HTMLLIElement)
  const index = siblings.indexOf(listItem)
  return (Number.isFinite(start) ? start : 1) + Math.max(index, 0)
}

function markSelectedListItems(range: Range): Array<() => void> {
  const root = range.commonAncestorContainer
  const scope = root instanceof Element ? root : root.parentElement
  const candidates = new Set<HTMLLIElement>()
  scope?.querySelectorAll('li').forEach((item) => {
    if (item instanceof HTMLLIElement) candidates.add(item)
  })
  ;[range.startContainer, range.endContainer, range.commonAncestorContainer].forEach((node) => {
    const item = getClosestListItem(node)
    if (item) candidates.add(item)
  })

  const cleanup: Array<() => void> = []
  candidates.forEach((item) => {
    if (!rangeIntersectsNode(item, range) || !isListElement(item.parentElement)) return

    const previousParent = item.getAttribute(LIST_PARENT_ATTR)
    const previousStart = item.getAttribute(LIST_START_ATTR)
    item.setAttribute(LIST_PARENT_ATTR, item.parentElement.nodeName.toLowerCase())
    item.setAttribute(LIST_START_ATTR, String(getListItemStart(item)))
    cleanup.push(() => {
      if (previousParent === null) {
        item.removeAttribute(LIST_PARENT_ATTR)
      } else {
        item.setAttribute(LIST_PARENT_ATTR, previousParent)
      }
      if (previousStart === null) {
        item.removeAttribute(LIST_START_ATTR)
      } else {
        item.setAttribute(LIST_START_ATTR, previousStart)
      }
    })
  })
  return cleanup
}

function isBlankTextNode(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
}

function getMarkedListType(node: Node): 'ol' | 'ul' | null {
  if (!(node instanceof HTMLLIElement) || isListElement(node.parentElement)) return null
  const parentType = node.getAttribute(LIST_PARENT_ATTR)
  return parentType === 'ol' || parentType === 'ul' ? parentType : null
}

function wrapOrphanListItems(parent: Element | DocumentFragment): void {
  let node = parent.firstChild
  while (node) {
    const listType = getMarkedListType(node)
    if (!listType) {
      const next = node.nextSibling
      if (node instanceof Element) wrapOrphanListItems(node)
      node = next
      continue
    }

    const wrapper = document.createElement(listType)
    if (listType === 'ol') {
      const start = (node as HTMLLIElement).getAttribute(LIST_START_ATTR)
      if (start) wrapper.setAttribute('start', start)
    }
    parent.insertBefore(wrapper, node)

    while (node) {
      const current: ChildNode = node
      node = current.nextSibling
      if (isBlankTextNode(current)) {
        current.remove()
        continue
      }
      if (getMarkedListType(current) === listType) {
        wrapper.appendChild(current)
        continue
      }
      node = current
      break
    }
    wrapOrphanListItems(wrapper)
  }
}

function clearClonedListMarkers(container: HTMLElement): void {
  container.querySelectorAll(`[${LIST_PARENT_ATTR}], [${LIST_START_ATTR}]`).forEach((element) => {
    element.removeAttribute(LIST_PARENT_ATTR)
    element.removeAttribute(LIST_START_ATTR)
  })
}

function normalizeSelectionFragment(container: HTMLElement): void {
  container.querySelectorAll('a').forEach((link) => {
    if (link instanceof HTMLAnchorElement && link.getAttribute('href')) {
      link.setAttribute('href', link.href)
    }
  })

  container.querySelectorAll('img').forEach((image) => {
    if (image instanceof HTMLImageElement && image.getAttribute('src')) {
      image.setAttribute('src', image.src)
    }
  })

  container.querySelectorAll('*').forEach((element) => {
    if (!(element instanceof Element)) return
    if (element.hasAttribute(FORMULA_MARKDOWN_ATTR)) return
    if (shouldSkipInvisible(element)) element.remove()
  })

  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.firstElementChild?.nodeName === 'CODE') return
    const codeNodes = pre.querySelectorAll('code')
    if (codeNodes.length !== 1) return
    const codeNode = codeNodes[0]
    const className = codeNode.getAttribute('class') ?? ''
    const codeText = codeNode.textContent ?? ''
    if (!/\blanguage-\S+\b/.test(className) && !codeText.includes('\n')) return

    const normalizedCode = document.createElement('code')
    if (className) normalizedCode.setAttribute('class', className)
    normalizedCode.textContent = codeText
    pre.replaceChildren(normalizedCode)
  })

  wrapOrphanListItems(container)
  clearClonedListMarkers(container)
}

function createTurndownService(): TurndownService {
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

  service.use(tables)
  service.remove(['script', 'style', 'noscript'])
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

function cloneSelectedFragment(root: Element | null, range: Range): DocumentFragment {
  if (!root) return range.cloneContents()

  const rootRange = document.createRange()
  const selectedRange = range.cloneRange()
  try {
    rootRange.selectNodeContents(root)

    if (compareBoundary(selectedRange, Range.START_TO_START, rootRange) < 0) {
      selectedRange.setStart(rootRange.startContainer, rootRange.startOffset)
    }
    if (compareBoundary(selectedRange, Range.END_TO_END, rootRange) > 0) {
      selectedRange.setEnd(rootRange.endContainer, rootRange.endOffset)
    }
    return selectedRange.collapsed ? document.createDocumentFragment() : selectedRange.cloneContents()
  } catch {
    return range.cloneContents()
  } finally {
    rootRange.detach()
    selectedRange.detach()
  }
}

function getSelectionHtml(): string {
  const range = getActiveSelectionRange()
  if (!range) return ''
  const container = document.createElement('div')
  const cleanup: Array<() => void> = []
  try {
    const root = getSelectionRoot(range)
    cleanup.push(...markSelectedFormulas(range))
    cleanup.push(...markSelectedListItems(range))
    container.appendChild(cloneSelectedFragment(root, range))
    normalizeSelectionFragment(container)
    return container.innerHTML
  } finally {
    cleanup.forEach((fn) => fn())
  }
}

function getSelectionMarkdown(): string {
  const html = getSelectionHtml()
  if (!html) return ''
  return cleanupMarkdownSpacing(createTurndownService().turndown(html))
}

function isCopyShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return false
  if (isEditableTarget(event.target instanceof Node ? event.target : null)) return false

  const isCopyKey = event.key.toLowerCase() === 'c'
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const usesSystemModifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
  return isCopyKey && usesSystemModifier
}

function onKeyDown(event: KeyboardEvent): void {
  if (!enabled || !isCopyShortcut(event)) return
  const markdown = getSelectionMarkdown()
  if (markdown) lastCopyPayload = markdown
}

function onCopy(event: ClipboardEvent): void {
  if (!enabled) return
  if (isCopyControlEvent(event)) return
  const markdown = getSelectionMarkdown() || lastCopyPayload
  if (!markdown) return
  lastCopyPayload = markdown
  event.preventDefault()
  event.stopImmediatePropagation()
  event.clipboardData?.setData('text/plain', markdown)
}

export const markdownCopy = {
  setFormulaWrapMode(mode: MarkdownFormulaWrapMode): void {
    formulaWrapMode = normalizeMarkdownFormulaWrapMode(mode)
  },

  enable(adapter: SiteAdapter): void {
    currentAdapter = adapter
    if (enabled) return
    enabled = true
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('copy', onCopy, true)
    console.log('[ChatGo] Markdown 复制已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    currentAdapter = null
    lastCopyPayload = ''
    document.removeEventListener('keydown', onKeyDown, true)
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
