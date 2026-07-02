// 分支提问模块（普适化版）：选区转引用 Markdown → 打开该站点新对话页 → 粘贴

import type { SiteAdapter } from '@/main/types'
import { readSettings } from '@/main/storage'
import { sendRuntimeMessage } from '@/main/messaging'
import { delay, waitForValue } from '@/main/utils'
import { markdownCopy } from './markdown-copy'

const BRANCH_BUTTON_IDLE_LABEL = '分支提问'
const BRANCH_BUTTON_LOADING_LABEL = '分支中…'
const BRANCH_BUTTON_ERROR_LABEL = '重试分支'
const SELECTION_IDLE_DELAY_MS = 300
const TURN_MORE_ACTIONS_PATTERN = /更多操作|More actions/i

let enabled = false
let adapter: SiteAdapter | null = null
let root: HTMLDivElement | null = null
let button: HTMLButtonElement | null = null
let activeSelection: { markdown: string; text: string; rect: DOMRect } | null = null
let selectionRefreshTimer: number | null = null
let selectionRefreshFrame: number | null = null
let actionInFlight = false
let consumeInFlight = false
let errorResetTimer: number | null = null
let mouseSelectionInProgress = false
let mouseSelectionChanged = false

function getRangeDisplayRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0)
  if (rects.length > 0) return rects[rects.length - 1]
  const fallback = range.getBoundingClientRect()
  return fallback.width > 0 || fallback.height > 0 ? fallback : null
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

function injectStyles(): void {
  if (document.getElementById('chatgo-branch-styles')) return
  const style = document.createElement('style')
  style.id = 'chatgo-branch-styles'
  style.textContent = `
    .chatgo-branch-root { position: fixed; z-index: 2147483646; }
    .chatgo-branch-button {
      padding: 6px 14px; border-radius: 999px; border: 1px solid #0A0A0A;
      background: #FFFFFF; color: #0A0A0A; font-size: 13px; font-family: system-ui, sans-serif;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: all 0.15s;
    }
    .chatgo-branch-button:hover { border-color: #3B82F6; color: #3B82F6; }
    .chatgo-branch-button:disabled { opacity: 0.6; cursor: wait; }
    .chatgo-branch-root[data-state="error"] .chatgo-branch-button { border-color: #dc2626; color: #dc2626; }
  `
  ;(document.head ?? document.documentElement).appendChild(style)
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

function getSelectionSnapshot(): { markdown: string; text: string; rect: DOMRect } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const text = selection.toString().replace(/\u00a0/g, ' ').trim()
  if (!text) return null
  const range = selection.getRangeAt(0)
  const rect = getRangeDisplayRect(range)
  if (!rect) return null
  // 排除在输入框内的选区
  const container = range.commonAncestorContainer
  const el = container instanceof Element ? container : container.parentElement
  if (el?.closest("input, textarea, [contenteditable='true']")) return null
  const markdown = markdownCopy.getSelectionMarkdown() || text
  return { markdown, text, rect }
}

function positionUi(snapshot: { rect: DOMRect }): void {
  ensureUi()
  if (!root) return
  const parent = document.body ?? document.documentElement
  if (root.parentElement !== parent) parent.appendChild(root)
  const rootWidth = Math.max(root.offsetWidth || 0, 90)
  const rootHeight = Math.max(root.offsetHeight || 0, 34)
  const left = Math.max(12, snapshot.rect.left - rootWidth - 10)
  let top = snapshot.rect.top + snapshot.rect.height / 2 - rootHeight / 2
  top = Math.max(12, Math.min(top, window.innerHeight - rootHeight - 12))
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
  if (errorResetTimer) {
    window.clearTimeout(errorResetTimer)
    errorResetTimer = null
  }
  resetButtonState()
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

// 把 Markdown 转成引用块
function formatBranchQuotedMarkdown(markdown: string): string {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const quoted = normalized.split('\n').map((line) => `>  ${line}`).join('\n')
  return `${quoted}\n\n`
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
  const draftText = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!draftText) return false
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
      type: 'CONSUME_BRANCH_DRAFT',
      pathname: window.location.pathname,
      referrer: document.referrer
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
    // 保存草稿到 service worker
    const saveResult = await sendRuntimeMessage({
      type: 'CREATE_BRANCH_DRAFT',
      draft: {
        text: formatBranchQuotedMarkdown(snapshot.markdown),
        sourceTurnId: `${Date.now()}`,
        sourcePath: window.location.pathname,
        sourceUrl: window.location.href,
        sourceTabId: -1, // 将在 background 中由 sender.tab.id 覆盖
        createdAt: Date.now()
      }
    })
    if (!saveResult.ok) throw new Error(saveResult.error ?? '保存分支草稿失败。')
    draftSaved = true
    // 在新标签打开新对话页
    window.open(newUrl, '_blank')
    await delay(100)
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
  if (!actionInFlight && root && !root.hidden) hideUi()
}

function handleMouseDown(event: MouseEvent): void {
  if (root && event.target instanceof Node && root.contains(event.target)) return
  if (event.button !== 0) return
  mouseSelectionInProgress = true
  mouseSelectionChanged = false
  if (!actionInFlight && root && !root.hidden) hideUi()
}

function handleMouseUp(event: MouseEvent): void {
  if (root && event.target instanceof Node && root.contains(event.target)) return
  if (event.button !== 0) return
  mouseSelectionInProgress = false
  if (!mouseSelectionChanged && !hasExpandedSelection()) return
  mouseSelectionChanged = false
  scheduleSelectionSync(SELECTION_IDLE_DELAY_MS, { hideFirst: false })
}

function handleViewportChange(): void {
  if (!enabled) return
  if (!activeSelection && (!root || root.hidden)) return
  scheduleSelectionSync(0, { hideFirst: false })
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

// 抑制未使用的导入
void TURN_MORE_ACTIONS_PATTERN
