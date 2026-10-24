// 选区复制为 Markdown 模块

import type { MarkdownFormulaWrapMode, SiteAdapter } from '@/main/types'
import { readSettings } from '@/main/storage'
import { copyTextToClipboard, normalizeMarkdownFormulaWrapMode } from '@/main/utils'
import { normalizeRawHtmlBlockLines } from './raw-html-block'
import { compareBoundary, getElementFromNode } from './markdown-copy/dom'
import { markClonedFormulas } from './markdown-copy/formula-marking'
import {
  markSelectedBlockquotes,
  markSelectedListItems,
  normalizeSelectionFragment
} from './markdown-copy/fragment'
import { cleanupMarkdownSpacing } from './markdown-copy/spacing'
import { createMarkdownTurndownService } from './markdown-copy/turndown'

let enabled = false
let formulaWrapMode: MarkdownFormulaWrapMode = 'with-delimiters'
let lastCopyPayload = ''
let formulaMarkId = 0
let currentAdapter: SiteAdapter | null = null

function isEditableTarget(node: Node | null): boolean {
  const el = getElementFromNode(node)
  if (!el) return false
  return Boolean(
    el.closest('input, textarea') || (el instanceof HTMLElement && el.isContentEditable)
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

function cloneSelectedFragment(root: Element | null, range: Range): DocumentFragment {
  if (!root) return range.cloneContents()

  const rootRange = document.createRange()
  const selectedRange = range.cloneRange()
  try {
    rootRange.selectNodeContents(root)

    // 只在同一条助手消息内扩展边界，避免跨消息选区把用户内容一起复制进去。
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

function nextFormulaMarkId(): string {
  formulaMarkId += 1
  return `${formulaMarkId}`
}

function getSelectionHtml(): string {
  const range = getActiveSelectionRange()
  if (!range) return ''
  const container = document.createElement('div')
  const cleanup: Array<() => void> = []
  try {
    const root = getSelectionRoot(range)
    cleanup.push(...markSelectedListItems(range))
    cleanup.push(...markSelectedBlockquotes(range))
    container.appendChild(cloneSelectedFragment(root, range))
    markClonedFormulas(container, formulaWrapMode, nextFormulaMarkId)
    normalizeSelectionFragment(container)
    return container.innerHTML
  } finally {
    cleanup.forEach((fn) => fn())
  }
}

function getSelectionMarkdown(): string {
  const html = getSelectionHtml()
  if (!html) return ''
  const turndown = createMarkdownTurndownService()
  return cleanupMarkdownSpacing(normalizeRawHtmlBlockLines(turndown.turndown(html)))
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
  if (!markdown) return

  // 部分聊天站点会拦截快捷键并阻止浏览器继续派发 copy 事件。
  // 必须在这次用户手势中直接写入；copy 监听器仍为菜单复制等入口兜底。
  lastCopyPayload = markdown
  event.preventDefault()
  event.stopImmediatePropagation()
  copyTextToClipboard(markdown).catch((error) => {
    console.warn('[ChatGo] Markdown 写入剪贴板失败。', error)
  })
}

function onCopy(event: ClipboardEvent): void {
  if (!enabled || !event.clipboardData) return
  if (isCopyControlEvent(event)) return
  // 写作块和输入框交给浏览器 / 编辑器复制；不能用旧内容覆盖本次选区。
  if (event.composedPath().some((item) => item instanceof Node && isEditableTarget(item))) return
  const markdown = getSelectionMarkdown()
  if (!markdown) return
  event.clipboardData.setData('text/plain', markdown)
  lastCopyPayload = markdown
  event.preventDefault()
  event.stopImmediatePropagation()
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
