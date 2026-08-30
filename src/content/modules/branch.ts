// 分支提问模块（普适化版）：选区转引用 Markdown → 打开该站点新对话页 → 粘贴

import type { SiteAdapter } from '@/main/types'
import { readSettings } from '@/main/storage'
import { sendRuntimeMessage } from '@/main/messaging'
import { waitForValue } from '@/main/utils'
import { markdownCopy } from './markdown-copy'
import { formatBranchQuotedMarkdown } from './branch-quote'
import { calculateBranchButtonPosition } from './branch-position'
import { buildChatGptBranchUrl } from './chatgpt-branch-route'

const BRANCH_BUTTON_IDLE_LABEL = '分支提问'
const BRANCH_BUTTON_LOADING_LABEL = '分支中…'
const BRANCH_BUTTON_ERROR_LABEL = '重试分支'
const SELECTION_IDLE_DELAY_MS = 300
const NATIVE_TOOLBAR_RETRY_DELAY_MS = 32
const NATIVE_TOOLBAR_MAX_RETRIES = 12
const NATIVE_ASK_ACTION_PATTERN = /^(?:询问\s*ChatGPT|Ask\s+ChatGPT)$/i
const NATIVE_WRITE_ACTION_PATTERN = /^(?:开始写作|Start\s+writing)$/i

interface SelectionSnapshot {
  markdown: string
  text: string
  rect: DOMRect
  backward: boolean
  messageId: string | null
}

let enabled = false
let adapter: SiteAdapter | null = null
let root: HTMLDivElement | null = null
let button: HTMLButtonElement | null = null
let activeSelection: SelectionSnapshot | null = null
let selectionRefreshTimer: number | null = null
let selectionRefreshFrame: number | null = null
let actionInFlight = false
let consumeInFlight = false
let errorResetTimer: number | null = null
let mouseSelectionInProgress = false
let mouseSelectionChanged = false
let nativeToolbarRetryTimer: number | null = null
let nativeToolbarRetryCount = 0
let nativeToolbarPreparing = false

function getBoundaryRect(node: Node | null, offset: number): DOMRect | null {
  if (!node) return null
  const boundary = document.createRange()
  try {
    boundary.setStart(node, offset)
    boundary.collapse(true)
    const rects = Array.from(boundary.getClientRects()).filter((rect) => rect.height > 0)
    if (rects.length > 0) return rects[0]
    const fallback = boundary.getBoundingClientRect()
    return fallback.height > 0 ? fallback : null
  } catch {
    return null
  } finally {
    boundary.detach()
  }
}

function getRangeDisplayRect(selection: Selection, range: Range): DOMRect | null {
  const focusRect = getBoundaryRect(selection.focusNode, selection.focusOffset)
  if (focusRect) return focusRect
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0)
  if (rects.length > 0) return rects[rects.length - 1]
  const fallback = range.getBoundingClientRect()
  return fallback.width > 0 || fallback.height > 0 ? fallback : null
}

function isBackwardSelection(selection: Selection): boolean {
  if (!selection.anchorNode || !selection.focusNode) return false
  if (
    selection.anchorNode === selection.focusNode &&
    selection.anchorOffset === selection.focusOffset
  ) {
    return false
  }
  const directionRange = document.createRange()
  try {
    directionRange.setStart(selection.anchorNode, selection.anchorOffset)
    directionRange.setEnd(selection.focusNode, selection.focusOffset)
    return directionRange.collapsed
  } catch {
    return false
  } finally {
    directionRange.detach()
  }
}

function ensureUi(): void {
  if (root || !document.body) return
  root = document.createElement('div')
  root.className = 'chatgo-branch-root'
  root.hidden = true
  button = document.createElement('button')
  button.type = 'button'
  button.className = 'chatgo-branch-button'
  button.textContent = BRANCH_BUTTON_IDLE_LABEL
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    openSelectionInBranch().catch((error) => console.error('[ChatGo] 打开分支失败。', error))
  })
  root.appendChild(button)
  ;(document.body ?? document.documentElement).appendChild(root)
  injectStyles()
}

function injectStyles(target: Document | ShadowRoot = document): void {
  if (target.querySelector('#chatgo-branch-styles')) return
  const style = document.createElement('style')
  style.id = 'chatgo-branch-styles'
  style.textContent = `
    .chatgo-branch-root { position: fixed; z-index: 2147483646; }
    .chatgo-branch-root[hidden] { display: none !important; }
    .chatgo-branch-root:not([data-embedded="true"]) .chatgo-branch-button {
      padding: 6px 14px; border-radius: 999px; border: 1px solid #0A0A0A;
      background: #FFFFFF; color: #0A0A0A; font-size: 13px; font-family: system-ui, sans-serif;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: all 0.15s;
    }
    .chatgo-branch-root:not([data-embedded="true"]) .chatgo-branch-button:hover {
      border-color: #3B82F6; color: #3B82F6;
    }
    .chatgo-branch-root:not([data-embedded="true"]) .chatgo-branch-button:disabled {
      opacity: 0.6; cursor: wait;
    }
    .chatgo-branch-root:not([data-embedded="true"])[data-state="error"] .chatgo-branch-button {
      border-color: #dc2626; color: #dc2626;
    }
    .chatgo-branch-root[data-embedded="true"] {
      position: static; z-index: auto; display: contents;
    }
    .chatgo-branch-root[data-embedded="true"] .chatgo-branch-button {
      background: var(--chatgo-native-toolbar-bg, #FFFFFF);
      color: inherit; white-space: nowrap; position: relative;
    }
    .chatgo-branch-root[data-embedded="true"] .chatgo-branch-button::before {
      content: "";
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      width: 1px;
      background: color-mix(in srgb, currentColor 16%, transparent);
      pointer-events: none;
    }
    .chatgo-branch-root[data-embedded="true"] .chatgo-branch-button:hover {
      background: color-mix(
        in srgb,
        var(--chatgo-native-toolbar-bg, #FFFFFF) 93%,
        currentColor
      );
      color: inherit;
    }
    .chatgo-branch-root[data-embedded="true"] .chatgo-branch-button:disabled {
      opacity: 1; cursor: default;
    }
  `
  if (target instanceof Document) {
    ;(target.head ?? target.documentElement).appendChild(style)
  } else {
    target.appendChild(style)
  }
}

function setButtonState(state: string, label: string): void {
  ensureUi()
  if (!root || !button) return
  root.dataset.state = state
  button.textContent = label
  button.disabled = state === 'loading'
}

function resetButtonState(): void {
  if (!root || !button) return
  delete root.dataset.state
  button.textContent = BRANCH_BUTTON_IDLE_LABEL
  button.disabled = false
}

function hideUi(): void {
  activeSelection = null
  nativeToolbarPreparing = false
  if (nativeToolbarRetryTimer) {
    window.clearTimeout(nativeToolbarRetryTimer)
    nativeToolbarRetryTimer = null
  }
  nativeToolbarRetryCount = 0
  if (errorResetTimer) {
    window.clearTimeout(errorResetTimer)
    errorResetTimer = null
  }
  if (!root) return
  if (root.hidden && !root.dataset.state) return
  resetButtonState()
  root.hidden = true
}

function hasExpandedSelection(): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false
  return Boolean(selection.toString().replace(/\u00a0/g, ' ').trim())
}

function closestElement(node: Node | null): Element | null {
  if (node instanceof Element) return node
  return node?.parentElement ?? null
}

function findSelectionTurn(range: Range): HTMLElement | null {
  const selector = adapter?.selectors.messageTurn
  if (!selector) return null
  for (const node of [range.commonAncestorContainer, range.endContainer, range.startContainer]) {
    const turn = closestElement(node)?.closest(selector)
    if (turn instanceof HTMLElement) return turn
  }
  return null
}

function findSelectionMessageId(
  selection: Selection,
  range: Range,
  turn: HTMLElement | null
): string | null {
  for (const node of [
    selection.focusNode,
    range.commonAncestorContainer,
    range.endContainer,
    range.startContainer
  ]) {
    const message = closestElement(node)?.closest('[data-message-id]')
    if (!(message instanceof HTMLElement) || (turn && !turn.contains(message))) continue
    const messageId = message.dataset.messageId?.trim()
    if (messageId) return messageId
  }
  return null
}

function getSelectionSnapshot(): SelectionSnapshot | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const text = selection.toString().replace(/\u00a0/g, ' ').trim()
  if (!text) return null
  const range = selection.getRangeAt(0)
  const rect = getRangeDisplayRect(selection, range)
  if (!rect) return null
  // 排除在输入框内的选区
  const container = range.commonAncestorContainer
  const el = container instanceof Element ? container : container.parentElement
  if (el?.closest("input, textarea, [contenteditable='true']")) return null
  const markdown = markdownCopy.getSelectionMarkdown() || text
  const turn = findSelectionTurn(range)
  return {
    markdown,
    text,
    rect,
    backward: isBackwardSelection(selection),
    messageId: findSelectionMessageId(selection, range, turn)
  }
}

function getSelectionGeometry(): Pick<SelectionSnapshot, 'rect' | 'backward'> | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const rect = getRangeDisplayRect(selection, range)
  if (!rect) return null
  return { rect, backward: isBackwardSelection(selection) }
}

function matchesActionLabel(element: HTMLElement, pattern: RegExp): boolean {
  return [
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? ''
  ].some((label) => pattern.test(label.replace(/\s+/g, ' ').trim()))
}

interface NativeSelectionToolbar {
  element: HTMLElement
  referenceAction: HTMLElement
}

function findNativeSelectionToolbarInRoot(
  searchRoot: ParentNode
): NativeSelectionToolbar | null {
  const actions = Array.from(
    searchRoot.querySelectorAll<HTMLElement>('button, [role="button"]')
  ).filter(isVisibleElement)
  const askAction = actions.find((action) =>
    matchesActionLabel(action, NATIVE_ASK_ACTION_PATTERN)
  )
  const writeAction = actions.find((action) =>
    matchesActionLabel(action, NATIVE_WRITE_ACTION_PATTERN)
  )
  if (!askAction || !writeAction) return null

  let commonParent = askAction.parentElement
  while (commonParent && !commonParent.contains(writeAction)) {
    commonParent = commonParent.parentElement
  }
  if (!commonParent) return null
  const rect = commonParent.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || rect.width > 600 || rect.height > 80) return null
  return { element: commonParent, referenceAction: writeAction }
}

function findNativeSelectionToolbar(): NativeSelectionToolbar | null {
  if (adapter?.id !== 'chatgpt') return null
  const directToolbar = findNativeSelectionToolbarInRoot(document)
  if (directToolbar) return directToolbar

  const shadowRoots: ShadowRoot[] = []
  const searchOpenShadowRoots = (searchRoot: ParentNode): void => {
    searchRoot.querySelectorAll('*').forEach((element) => {
      if (!element.shadowRoot || shadowRoots.includes(element.shadowRoot)) return
      shadowRoots.push(element.shadowRoot)
      searchOpenShadowRoots(element.shadowRoot)
    })
  }
  searchOpenShadowRoots(document)
  for (const shadowRoot of shadowRoots) {
    const toolbar = findNativeSelectionToolbarInRoot(shadowRoot)
    if (toolbar) return toolbar
  }
  return null
}

function isTransparentColor(color: string): boolean {
  const normalized = color.replace(/\s+/g, '').toLowerCase()
  return (
    !normalized ||
    normalized === 'transparent' ||
    normalized === 'rgba(0,0,0,0)' ||
    normalized.endsWith(',0)')
  )
}

function getNativeToolbarBackground(toolbar: NativeSelectionToolbar): string {
  for (const element of [toolbar.referenceAction, toolbar.element]) {
    const background = window.getComputedStyle(element).backgroundColor
    if (!isTransparentColor(background)) return background
  }
  const pageBackground = window.getComputedStyle(document.body).backgroundColor
  return isTransparentColor(pageBackground) ? '#FFFFFF' : pageBackground
}

function embedInNativeSelectionToolbar(): boolean {
  if (!root) return false
  const toolbar = findNativeSelectionToolbar()
  if (!toolbar) return false
  const toolbarRoot = toolbar.element.getRootNode()
  if (toolbarRoot instanceof ShadowRoot) injectStyles(toolbarRoot)
  if (button) {
    const nativeClasses = toolbar.referenceAction.getAttribute('class') ?? ''
    button.className = `${nativeClasses} chatgo-branch-button`.trim()
  }
  if (root.parentElement !== toolbar.element) toolbar.element.appendChild(root)
  root.style.setProperty('--chatgo-native-toolbar-bg', getNativeToolbarBackground(toolbar))
  root.dataset.embedded = 'true'
  root.style.removeProperty('left')
  root.style.removeProperty('top')
  root.hidden = false
  return true
}

function scheduleNativeToolbarRetry(): void {
  if (
    adapter?.id !== 'chatgpt' ||
    nativeToolbarRetryTimer ||
    nativeToolbarRetryCount >= NATIVE_TOOLBAR_MAX_RETRIES
  ) {
    return
  }
  nativeToolbarRetryCount += 1
  nativeToolbarRetryTimer = window.setTimeout(() => {
    nativeToolbarRetryTimer = null
    if (!enabled || actionInFlight) return
    if (embedInNativeSelectionToolbar()) {
      nativeToolbarRetryCount = 0
      return
    }
    if (activeSelection) {
      positionUi(activeSelection)
      return
    }
    if (nativeToolbarPreparing) scheduleNativeToolbarRetry()
  }, NATIVE_TOOLBAR_RETRY_DELAY_MS)
}

function prepareNativeToolbarButton(): void {
  if (adapter?.id !== 'chatgpt') return
  ensureUi()
  if (!root || !button) return
  nativeToolbarPreparing = true
  resetButtonState()
  button.disabled = true
  nativeToolbarRetryCount = 0
  if (!embedInNativeSelectionToolbar()) scheduleNativeToolbarRetry()
}

function positionUi(snapshot: Pick<SelectionSnapshot, 'rect' | 'backward'>): void {
  ensureUi()
  if (!root) return
  if (embedInNativeSelectionToolbar()) {
    nativeToolbarRetryCount = 0
    return
  }
  delete root.dataset.embedded
  root.style.removeProperty('--chatgo-native-toolbar-bg')
  if (button) button.className = 'chatgo-branch-button'
  scheduleNativeToolbarRetry()
  const parent = document.body ?? document.documentElement
  if (root.parentElement !== parent) parent.appendChild(root)
  const rootWidth = Math.max(root.offsetWidth || 0, 90)
  const rootHeight = Math.max(root.offsetHeight || 0, 34)
  const { left, top } = calculateBranchButtonPosition({
    anchor: snapshot.rect,
    buttonWidth: rootWidth,
    buttonHeight: rootHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    backward: snapshot.backward
  })
  root.style.left = `${left}px`
  root.style.top = `${top}px`
  root.hidden = false
}

function syncSelectionUi(): void {
  if (!enabled || actionInFlight) return
  const snapshot = getSelectionSnapshot()
  if (!snapshot) {
    hideUi()
    return
  }
  activeSelection = snapshot
  nativeToolbarPreparing = false
  if (errorResetTimer) {
    window.clearTimeout(errorResetTimer)
    errorResetTimer = null
  }
  resetButtonState()
  if (nativeToolbarRetryTimer) {
    window.clearTimeout(nativeToolbarRetryTimer)
    nativeToolbarRetryTimer = null
  }
  nativeToolbarRetryCount = 0
  positionUi(snapshot)
}

function scheduleSelectionSync(delayMs = 0, options: { hideFirst?: boolean } = {}): void {
  if (!enabled) return
  const { hideFirst = true } = options
  if (hideFirst && !actionInFlight) hideUi()
  if (selectionRefreshFrame) {
    window.cancelAnimationFrame(selectionRefreshFrame)
    selectionRefreshFrame = null
  }
  if (selectionRefreshTimer) {
    window.clearTimeout(selectionRefreshTimer)
    selectionRefreshTimer = null
  }
  const runSync = (): void => {
    selectionRefreshFrame = window.requestAnimationFrame(() => {
      selectionRefreshFrame = null
      syncSelectionUi()
    })
  }
  if (delayMs <= 0) {
    runSync()
    return
  }
  selectionRefreshTimer = window.setTimeout(() => {
    selectionRefreshTimer = null
    runSync()
  }, delayMs)
}

function scheduleSelectionPositionSync(): void {
  if (!enabled || !activeSelection || selectionRefreshFrame) return
  selectionRefreshFrame = window.requestAnimationFrame(() => {
    selectionRefreshFrame = null
    if (!activeSelection) return
    const geometry = getSelectionGeometry()
    if (!geometry) {
      hideUi()
      return
    }
    activeSelection = { ...activeSelection, ...geometry }
    positionUi(activeSelection)
  })
}

function isVisibleElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0
}

// 普适化：在新对话页找到输入框并粘贴草稿
function findComposer(): HTMLElement | null {
  const selector = adapter?.selectors.composer
  if (selector) {
    const candidates = Array.from(document.querySelectorAll(selector))
    for (const el of candidates) {
      if (el instanceof HTMLElement && el.getClientRects().length > 0) return el
    }
  }
  // 通用回退
  const fallbackCandidates = Array.from(document.querySelectorAll('div[contenteditable="true"], textarea'))
  for (const el of fallbackCandidates) {
    if (el instanceof HTMLElement && el.getClientRects().length > 0) return el
  }
  return null
}

function getComposerPlainText(composer: HTMLElement): string {
  return String(composer.innerText ?? composer.textContent ?? '').replace(/\u200b/g, '').trim()
}

function normalizeComparableText(text: string): string {
  return String(text ?? '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim()
}

function composerContainsText(text: string, composer = findComposer()): boolean {
  if (!(composer instanceof HTMLElement)) return false
  const target = normalizeComparableText(text)
  if (!target) return false
  return normalizeComparableText(getComposerPlainText(composer)).includes(target)
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function insertTextIntoComposer(composer: HTMLElement, text: string): Promise<boolean> {
  const normalizedText = String(text ?? '').replace(/\r\n/g, '\n')
  if (!normalizedText.trim()) return false
  const draftText = normalizedText.replace(/^\n+/, '')
  if (composerContainsText(draftText, composer)) return true
  composer.focus()
  const range = document.createRange()
  range.selectNodeContents(composer)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: draftText
  })
  composer.dispatchEvent(beforeInput)
  let inserted = false
  try {
    inserted = document.execCommand('insertText', false, draftText)
  } catch {
    inserted = false
  }
  if (!inserted) {
    // 回退：直接设置 textContent（textarea）或 DOM 拼装（contenteditable）
    if (composer instanceof HTMLTextAreaElement) {
      composer.value = draftText
      composer.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      composer.textContent = draftText
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    }
  }
  composer.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: draftText })
  )
  placeCaretAtEnd(composer)
  if (composerContainsText(draftText, composer)) return true
  const confirmed = await waitForValue(
    () => (composerContainsText(draftText) ? true : null),
    { timeoutMs: 1500, intervalMs: 80 }
  )
  return Boolean(confirmed)
}

// 消费待处理的分支草稿（在新对话页加载后调用）
async function consumePendingBranchDraft(): Promise<void> {
  if (!enabled || consumeInFlight) return
  consumeInFlight = true
  try {
    const result = await sendRuntimeMessage<{ text: string }>({
      type: 'CONSUME_BRANCH_DRAFT'
    })
    if (!result.ok || !result.data?.text) return
    const composer = await waitForValue(() => findComposer(), {
      timeoutMs: 15000,
      intervalMs: 100
    })
    if (!composer) return
    if (composerContainsText(result.data.text, composer)) return
    const inserted = await insertTextIntoComposer(composer, result.data.text)
    if (!inserted) console.warn('[ChatGo] 未能把选区写入新对话输入框。')
  } catch (error) {
    console.error('[ChatGo] 自动填充分支草稿失败。', error)
  } finally {
    consumeInFlight = false
  }
}

// 打开分支：保存草稿 → 在新标签打开该站点新对话页
async function openSelectionInBranch(): Promise<void> {
  if (actionInFlight || !activeSelection || !adapter) return
  const snapshot = activeSelection
  let draftSaved = false
  let failed = false
  actionInFlight = true
  setButtonState('loading', BRANCH_BUTTON_LOADING_LABEL)
  try {
    const newUrl = adapter.getNewConversationUrl?.(new URL(window.location.href)) ?? window.location.origin
    const chatGptBranchUrl =
      adapter.id === 'chatgpt'
        ? buildChatGptBranchUrl(window.location.href, snapshot.messageId ?? '')
        : null
    if (adapter.id === 'chatgpt' && !chatGptBranchUrl) {
      throw new Error('无法从当前对话和框选消息生成 ChatGPT 分支地址。')
    }
    // 保存草稿到 service worker
    const saveResult = await sendRuntimeMessage({
      type: 'CREATE_BRANCH_DRAFT',
      draft: {
        text: formatBranchQuotedMarkdown(snapshot.markdown),
        sourceTurnId: snapshot.messageId ?? `${Date.now()}`,
        sourcePath: window.location.pathname,
        sourceUrl: window.location.href,
        createdAt: Date.now()
      }
    })
    if (!saveResult.ok) throw new Error(saveResult.error ?? '保存分支草稿失败。')
    draftSaved = true
    if (adapter.id === 'chatgpt') {
      // 复用 ChatGPT 原生前端的 /branch/{conversationId}/{messageId} 路由。
      // 不点击原页面中的菜单，避免焦点和滚动位置发生任何变化。
      if (!chatGptBranchUrl) throw new Error('ChatGPT 分支地址为空。')
      const openResult = await sendRuntimeMessage({
        type: 'OPEN_BRANCH_TAB',
        url: chatGptBranchUrl
      })
      if (!openResult.ok) throw new Error(openResult.error ?? '打开 ChatGPT 分支标签页失败。')
    } else {
      // 其他站点仍使用通用的新对话页回填逻辑。
      const openResult = await sendRuntimeMessage({
        type: 'OPEN_BRANCH_TAB',
        url: newUrl
      })
      if (!openResult.ok) throw new Error(openResult.error ?? '打开分支标签页失败。')
    }
    hideUi()
  } catch (error) {
    failed = true
    if (draftSaved) {
      await sendRuntimeMessage({ type: 'CLEAR_BRANCH_DRAFT' })
    }
    console.error('[ChatGo] 打开分支失败。', error)
    setButtonState('error', BRANCH_BUTTON_ERROR_LABEL)
    errorResetTimer = window.setTimeout(() => {
      errorResetTimer = null
      actionInFlight = false
      scheduleSelectionSync()
    }, 1400)
  } finally {
    if (!failed) actionInFlight = false
  }
}

// 事件处理
function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return
  scheduleSelectionSync(0, { hideFirst: false })
  consumePendingBranchDraft().catch((error) =>
    console.error('[ChatGo] 恢复分支草稿失败。', error)
  )
}

function handleSelectionChange(): void {
  if (!enabled || !mouseSelectionInProgress) return
  mouseSelectionChanged = true
  // 嵌入 ChatGPT 原生工具条后，由原生父节点统一控制显示周期。
  if (!actionInFlight && root && !root.hidden && root.dataset.embedded !== 'true') hideUi()
}

function handleMouseDown(event: MouseEvent): void {
  if (root && event.target instanceof Node && root.contains(event.target)) return
  if (event.button !== 0) return
  const followsNativeToolbar = root?.dataset.embedded === 'true'
  if (!followsNativeToolbar) nativeToolbarPreparing = false
  mouseSelectionInProgress = true
  mouseSelectionChanged = false
  if (!actionInFlight && root && !root.hidden && !followsNativeToolbar) hideUi()
}

function handleMouseUp(event: MouseEvent): void {
  if (root && event.target instanceof Node && root.contains(event.target)) return
  if (event.button !== 0) return
  mouseSelectionInProgress = false
  if (!mouseSelectionChanged && !hasExpandedSelection()) return
  mouseSelectionChanged = false
  prepareNativeToolbarButton()
  scheduleSelectionSync(SELECTION_IDLE_DELAY_MS, { hideFirst: false })
}

function handleViewportChange(): void {
  if (!enabled) return
  if (!activeSelection && (!root || root.hidden)) return
  scheduleSelectionPositionSync()
}

export const branch = {
  enable(siteAdapter: SiteAdapter): void {
    if (enabled) return
    enabled = true
    adapter = siteAdapter
    ensureUi()
    document.addEventListener('selectionchange', handleSelectionChange, true)
    document.addEventListener('mouseup', handleMouseUp, true)
    document.addEventListener('mousedown', handleMouseDown, true)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('pageshow', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleSelectionSync(0, { hideFirst: false })
    consumePendingBranchDraft().catch((error) =>
      console.error('[ChatGo] 初始化分支草稿失败。', error)
    )
    console.log('[ChatGo] 分支提问已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    if (errorResetTimer) {
      window.clearTimeout(errorResetTimer)
      errorResetTimer = null
    }
    if (selectionRefreshFrame) {
      window.cancelAnimationFrame(selectionRefreshFrame)
      selectionRefreshFrame = null
    }
    if (selectionRefreshTimer) {
      window.clearTimeout(selectionRefreshTimer)
      selectionRefreshTimer = null
    }
    if (nativeToolbarRetryTimer) {
      window.clearTimeout(nativeToolbarRetryTimer)
      nativeToolbarRetryTimer = null
    }
    nativeToolbarRetryCount = 0
    nativeToolbarPreparing = false
    document.removeEventListener('selectionchange', handleSelectionChange, true)
    document.removeEventListener('mouseup', handleMouseUp, true)
    document.removeEventListener('mousedown', handleMouseDown, true)
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('pageshow', handleVisibilityChange)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (root) {
      root.remove()
      root = null
      button = null
    }
    activeSelection = null
    actionInFlight = false
    consumeInFlight = false
    console.log('[ChatGo] 分支提问已关闭。')
  },

  async syncSettings(): Promise<void> {
    const settings = await readSettings()
    enabled = settings.branchEnabled
  }
}
