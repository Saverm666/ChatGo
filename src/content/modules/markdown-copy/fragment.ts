// 选区片段规整：在 cloneContents 前后补齐列表、引用、代码块等上下文。

import { rangeIntersectsNode } from './dom'
import {
  FORMULA_MARKDOWN_ATTR,
  LIST_PARENT_ATTR,
  LIST_START_ATTR,
  QUOTE_DEPTH_ATTR
} from './constants'

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

export function markSelectedListItems(range: Range): Array<() => void> {
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

function getBlockquoteDepth(node: Node | null): number {
  let depth = 0
  let current = node instanceof Element ? node : node?.parentElement ?? null
  while (current) {
    if (current instanceof HTMLQuoteElement && current.nodeName === 'BLOCKQUOTE') depth += 1
    current = current.parentElement
  }
  return depth
}

export function markSelectedBlockquotes(range: Range): Array<() => void> {
  const root = range.commonAncestorContainer
  const scope = root instanceof Element ? root : root.parentElement
  const candidates = new Set<HTMLQuoteElement>()
  scope?.querySelectorAll('blockquote').forEach((item) => {
    if (item instanceof HTMLQuoteElement) candidates.add(item)
  })
  ;[range.startContainer, range.endContainer, range.commonAncestorContainer].forEach((node) => {
    let current = node instanceof Element ? node : node?.parentElement ?? null
    while (current) {
      if (current instanceof HTMLQuoteElement && current.nodeName === 'BLOCKQUOTE') {
        candidates.add(current)
      }
      current = current.parentElement
    }
  })

  const cleanup: Array<() => void> = []
  candidates.forEach((item) => {
    if (!rangeIntersectsNode(item, range)) return
    const previousDepth = item.getAttribute(QUOTE_DEPTH_ATTR)
    item.setAttribute(QUOTE_DEPTH_ATTR, String(getBlockquoteDepth(item)))
    cleanup.push(() => {
      if (previousDepth === null) {
        item.removeAttribute(QUOTE_DEPTH_ATTR)
      } else {
        item.setAttribute(QUOTE_DEPTH_ATTR, previousDepth)
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

function normalizeCodeLanguageLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-')
}

function extractCodeText(code: HTMLElement): string {
  const text = typeof code.innerText === 'string' && code.innerText
    ? code.innerText
    : code.textContent ?? ''
  return text.replace(/\n+$/g, '')
}

function normalizeWrappedCodeBlocks(container: HTMLElement): void {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.firstElementChild?.nodeName === 'CODE') return

    const codeNode =
      pre.querySelector('.cm-content code') ??
      pre.querySelector('#code-block-viewer code') ??
      pre.querySelector('.cm-scroller code') ??
      pre.querySelector('code')
    if (!(codeNode instanceof HTMLElement)) return

    const codeText = extractCodeText(codeNode)
    if (!codeText) return

    const languageLabel = pre.querySelector('.text-token-text-primary')?.textContent?.trim() ?? ''
    const normalizedCode = document.createElement('code')
    if (languageLabel) {
      normalizedCode.setAttribute('class', `language-${normalizeCodeLanguageLabel(languageLabel)}`)
    }
    normalizedCode.textContent = codeText
    pre.replaceChildren(normalizedCode)
  })
}

function restoreMissingBlockquoteWrappers(container: HTMLElement): void {
  const firstBlock = container.querySelector(`blockquote[${QUOTE_DEPTH_ATTR}]`)
  if (!(firstBlock instanceof HTMLQuoteElement)) return

  const depth = Number(firstBlock.getAttribute(QUOTE_DEPTH_ATTR) ?? '0')
  if (!Number.isFinite(depth) || depth <= 1) return

  let wrapped: HTMLElement = firstBlock
  for (let currentDepth = depth - 1; currentDepth >= 1; currentDepth -= 1) {
    if (wrapped.parentElement?.matches(`blockquote[${QUOTE_DEPTH_ATTR}="${currentDepth}"]`)) continue
    const blockquote = document.createElement('blockquote')
    wrapped.replaceWith(blockquote)
    blockquote.appendChild(wrapped)
    wrapped = blockquote
  }
}

function clearClonedQuoteMarkers(container: HTMLElement): void {
  container.querySelectorAll(`[${QUOTE_DEPTH_ATTR}]`).forEach((element) => {
    element.removeAttribute(QUOTE_DEPTH_ATTR)
  })
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

export function normalizeSelectionFragment(container: HTMLElement): void {
  normalizeWrappedCodeBlocks(container)

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

  // 部分选区会只克隆列表项或内层引用块，这里补回父容器供 Turndown 正确识别结构。
  restoreMissingBlockquoteWrappers(container)
  wrapOrphanListItems(container)
  clearClonedQuoteMarkers(container)
  clearClonedListMarkers(container)
}
