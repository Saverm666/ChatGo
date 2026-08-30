// 长对话虚拟滚动：使用 content-visibility 按视口跳过离屏消息的布局与绘制。
// 不移除 React 管理的 DOM，避免破坏 ChatGPT 的事件、状态和后续增量更新。

import type { SiteAdapter } from '@/main/types'

const TURN_ATTR = 'data-chatgo-virtualized-turn'
const ACTIVE_ATTR = 'data-chatgo-virtual-scroll'
const STYLE_ID = 'chatgo-virtual-scroll-styles'

let enabled = false
let active = false
let adapter: SiteAdapter | null = null
let routeHooked = false
let observer: MutationObserver | null = null
let pendingScanFrame: number | null = null
const pendingRoots = new Set<Element>()
const pendingEstimateTurns = new Set<HTMLElement>()
const lastEstimateAt = new WeakMap<HTMLElement, number>()
const estimateTimers = new Map<HTMLElement, number>()

const ESTIMATED_BLOCK_SELECTOR =
  'p, li, pre, table, blockquote, h1, h2, h3, h4, h5, h6, .katex-display, [data-message-content-part]'

function getRole(node: Element): 'user' | 'assistant' | '' {
  const explicitRole = node.getAttribute('data-turn')
  if (explicitRole === 'user' || explicitRole === 'assistant') return explicitRole
  const selectors = adapter?.selectors
  if (!selectors) return ''
  if (selectors.userMessage && (node.matches(selectors.userMessage) || node.querySelector(selectors.userMessage))) {
    return 'user'
  }
  if (
    selectors.assistantMessage &&
    (node.matches(selectors.assistantMessage) || node.querySelector(selectors.assistantMessage))
  ) {
    return 'assistant'
  }
  return ''
}

function getTurnSelector(): string {
  return adapter?.selectors.messageTurn ?? '[data-turn], [data-testid^="conversation-turn-"]'
}

function markTurn(node: Element): void {
  if (!(node instanceof HTMLElement) || node.hasAttribute(TURN_ATTR)) return
  const role = getRole(node)
  const fallbackHeight = role === 'user' ? 160 : role === 'assistant' ? 900 : 600
  node.setAttribute(TURN_ATTR, '1')
  node.style.setProperty('--chatgo-turn-intrinsic-height', `${fallbackHeight}px`)
  scheduleHeightEstimate(node, true)
}

function updateHeightEstimate(node: HTMLElement): void {
  if (!node.isConnected || !node.hasAttribute(TURN_ATTR)) return
  const role = getRole(node)
  const blockCount = node.querySelectorAll(ESTIMATED_BLOCK_SELECTOR).length
  if (blockCount === 0) return
  const estimate = role === 'user'
    ? Math.max(160, Math.min(2400, 100 + blockCount * 28))
    : Math.max(900, Math.min(16000, 260 + blockCount * 34))
  node.style.setProperty('--chatgo-turn-intrinsic-height', `${estimate}px`)
  lastEstimateAt.set(node, performance.now())
}

function scheduleHeightEstimate(node: HTMLElement, immediate = false): void {
  const lastUpdated = lastEstimateAt.get(node) ?? 0
  const elapsed = performance.now() - lastUpdated
  if (!immediate && elapsed < 500) {
    if (!estimateTimers.has(node)) {
      const timer = window.setTimeout(() => {
        estimateTimers.delete(node)
        if (!node.isConnected || !node.hasAttribute(TURN_ATTR)) return
        pendingEstimateTurns.add(node)
        schedulePendingWork()
      }, Math.max(0, 500 - elapsed))
      estimateTimers.set(node, timer)
    }
    return
  }
  const existingTimer = estimateTimers.get(node)
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer)
    estimateTimers.delete(node)
  }
  pendingEstimateTurns.add(node)
  schedulePendingWork()
}

function scanRoot(root: ParentNode): void {
  const selector = getTurnSelector()
  if (root instanceof Element && root.matches(selector)) markTurn(root)
  root.querySelectorAll(selector).forEach(markTurn)
}

function scheduleRootScan(root: Element): void {
  pendingRoots.add(root)
  schedulePendingWork()
}

function schedulePendingWork(): void {
  if (pendingScanFrame !== null) return
  pendingScanFrame = window.requestAnimationFrame(() => {
    pendingScanFrame = null
    const roots = Array.from(pendingRoots)
    pendingRoots.clear()
    roots.forEach(scanRoot)
    const turns = Array.from(pendingEstimateTurns)
    pendingEstimateTurns.clear()
    turns.forEach(updateHeightEstimate)
  })
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    html[${ACTIVE_ATTR}="1"] [${TURN_ATTR}="1"] {
      content-visibility: auto !important;
      contain-intrinsic-size: auto var(--chatgo-turn-intrinsic-height, 600px) !important;
    }
  `
  ;(document.head ?? document.documentElement).appendChild(style)
}

function startObserver(): void {
  if (observer) return
  observer = new MutationObserver((records) => {
    const selector = getTurnSelector()
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        const containingTurn = node.closest<HTMLElement>(`[${TURN_ATTR}="1"]`)
        if (containingTurn) {
          scheduleHeightEstimate(containingTurn)
          return
        }
        if (node.matches(selector) || node.querySelector(selector)) {
          scheduleRootScan(node)
        }
      })
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

function stopObserver(): void {
  observer?.disconnect()
  observer = null
  if (pendingScanFrame !== null) {
    window.cancelAnimationFrame(pendingScanFrame)
    pendingScanFrame = null
  }
  pendingRoots.clear()
  pendingEstimateTurns.clear()
  estimateTimers.forEach((timer) => window.clearTimeout(timer))
  estimateTimers.clear()
}

function getVirtualizedNodes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${TURN_ATTR}="1"]`))
}

function emitVisibilityChange(): void {
  try {
    window.dispatchEvent(new CustomEvent('chatgo:conversation-visibility-change'))
  } catch {
    // 忽略
  }
}

export function collapseOldMessages(): {
  ok: boolean
  reason?: string
  message: string
  collapsedCount?: number
  visibleCount?: number
} {
  if (!enabled) {
    return { ok: false, reason: 'disabled', message: '请先开启长对话虚拟滚动。' }
  }
  injectStyles()
  active = true
  document.documentElement.setAttribute(ACTIVE_ATTR, '1')
  scanRoot(document)
  startObserver()
  const count = getVirtualizedNodes().length
  emitVisibilityChange()
  return {
    ok: true,
    collapsedCount: count,
    visibleCount: count,
    message: count
      ? `已轻量化 ${count} 条消息，滚动接近时自动恢复渲染。`
      : '虚拟滚动已开启，新消息会自动按视口渲染。'
  }
}

export function restoreMessages(): { ok: boolean; restoredCount: number; message: string } {
  const nodes = getVirtualizedNodes()
  active = false
  stopObserver()
  document.documentElement.removeAttribute(ACTIVE_ATTR)
  nodes.forEach((node) => {
    node.removeAttribute(TURN_ATTR)
    node.style.removeProperty('--chatgo-turn-intrinsic-height')
  })
  document.getElementById(STYLE_ID)?.remove()
  if (nodes.length) emitVisibilityChange()
  return {
    ok: nodes.length > 0,
    restoredCount: nodes.length,
    message: nodes.length ? '已关闭虚拟滚动并恢复完整渲染。' : '当前没有虚拟化消息。'
  }
}

export function getCollapseState(): {
  enabled: boolean
  keepLatest: number
  collapsedCount: number
} {
  return {
    enabled,
    keepLatest: 0,
    collapsedCount: active ? getVirtualizedNodes().length : 0
  }
}

function handleRouteChange(): void {
  if (!enabled) return
  if (!active) {
    collapseOldMessages()
    return
  }
  // SPA 路由切换期间保持全局虚拟化生效，避免新会话历史先完整渲染一帧。
  scanRoot(document)
  startObserver()
}

function hookRouteChangesOnce(): void {
  if (routeHooked) return
  routeHooked = true
  ;(['pushState', 'replaceState'] as const).forEach((method) => {
    const original = history[method]
    if (typeof original !== 'function') return
    history[method] = function patched(this: History, ...args: unknown[]): void {
      const result = original.apply(this, args as never)
      window.setTimeout(handleRouteChange, 0)
      return result as never
    }
  })
  window.addEventListener('popstate', handleRouteChange)
  window.addEventListener('hashchange', handleRouteChange)
}

export const collapse = {
  setKeepLatest(_value: number): void {
    // 兼容旧 API；虚拟滚动不再按轮数裁剪。
  },

  async enable(siteAdapter: SiteAdapter): Promise<void> {
    adapter = siteAdapter
    if (enabled) {
      if (active) {
        scanRoot(document)
        startObserver()
      }
      return
    }
    enabled = true
    hookRouteChangesOnce()
    collapseOldMessages()
    console.log('[ChatGo] 长对话虚拟滚动已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    restoreMessages()
    console.log('[ChatGo] 长对话虚拟滚动已关闭。')
  },

  async setEnabledState(nextEnabled: boolean): Promise<void> {
    if (nextEnabled && adapter) {
      await this.enable(adapter)
    } else {
      this.disable()
    }
  },

  collapse: collapseOldMessages,
  restore: restoreMessages,
  getState: getCollapseState
}

declare global {
  interface Window {
    ChatGoCollapse?: typeof collapse
  }
}
window.ChatGoCollapse = collapse
