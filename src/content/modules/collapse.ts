// 长对话折叠模块：按轮次隐藏较早消息，保留最近 N 轮

import type { SiteAdapter } from '@/main/types'
import { readSettings } from '@/main/storage'
import { normalizeKeepLatest } from '@/main/utils'

const COLLAPSED_ATTR = 'data-chatgo-collapsed'

let enabled = false
let keepLatest = 20
let adapter: SiteAdapter | null = null
let routeHooked = false

function getRole(node: Element): 'user' | 'assistant' | '' {
  const selectors = adapter?.selectors
  if (!selectors) return ''
  if (selectors.userMessage && node.matches?.(selectors.userMessage)) return 'user'
  if (selectors.assistantMessage && node.matches?.(selectors.assistantMessage)) return 'assistant'
  // 嵌套查找
  if (selectors.userMessage && node.querySelector?.(selectors.userMessage)) return 'user'
  if (selectors.assistantMessage && node.querySelector?.(selectors.assistantMessage)) return 'assistant'
  return ''
}

function getMessageNodes(): Element[] {
  const selectors = adapter?.selectors
  if (!selectors) return []
  const rootSelector = selectors.messageRoot ?? 'main'
  const root = document.querySelector(rootSelector)
  if (!root) return []
  const turnSelector = selectors.messageTurn ?? '[class*="message"]'
  const candidates = Array.from(root.querySelectorAll(turnSelector))
  const seen = new Set<Element>()
  const nodes: Element[] = []
  candidates.forEach((node) => {
    if (seen.has(node)) return
    // 去重：若被其他候选包含则跳过
    for (const other of candidates) {
      if (other !== node && other.contains(node) && !seen.has(other)) {
        seen.add(node)
        return
      }
    }
    seen.add(node)
    if (getRole(node) || String(node.textContent ?? '').trim()) {
      nodes.push(node)
    }
  })
  return nodes
}

function getConversationRounds(nodes: Element[]): { nodes: Element[]; hasUser: boolean }[] {
  const rounds: { nodes: Element[]; hasUser: boolean }[] = []
  let current: { nodes: Element[]; hasUser: boolean } | null = null
  for (const node of nodes) {
    const role = getRole(node)
    if (role === 'user' || !current) {
      current = { nodes: [], hasUser: role === 'user' }
      rounds.push(current)
    }
    current.nodes.push(node)
  }
  return rounds.filter((r) => r.nodes.length > 0)
}

function getCollapsedNodes(): Element[] {
  return Array.from(document.querySelectorAll(`[${COLLAPSED_ATTR}="1"]`))
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
    return { ok: false, reason: 'disabled', message: '请先开启长对话折叠。' }
  }
  const nodes = getMessageNodes().filter((n) => n.getAttribute(COLLAPSED_ATTR) !== '1')
  const rounds = getConversationRounds(nodes)
  if (rounds.length <= keepLatest) {
    return {
      ok: false,
      reason: 'not-enough',
      message: `当前对话不超过 ${keepLatest} 轮，无需轻量化。`,
      visibleCount: rounds.length
    }
  }
  const toCollapse = rounds.slice(0, rounds.length - keepLatest).flatMap((r) => r.nodes)
  toCollapse.forEach((node) => {
    node.setAttribute(COLLAPSED_ATTR, '1')
    node.setAttribute('aria-hidden', 'true')
  })
  emitVisibilityChange()
  return {
    ok: true,
    collapsedCount: toCollapse.length,
    visibleCount: keepLatest,
    message: `已隐藏 ${rounds.length - keepLatest} 轮较早对话，保留最近 ${keepLatest} 轮。`
  }
}

export function restoreMessages(): { ok: boolean; restoredCount: number; message: string } {
  const collapsed = getCollapsedNodes()
  collapsed.forEach((node) => {
    node.removeAttribute(COLLAPSED_ATTR)
    node.removeAttribute('aria-hidden')
  })
  if (collapsed.length) emitVisibilityChange()
  return {
    ok: collapsed.length > 0,
    restoredCount: collapsed.length,
    message: collapsed.length ? '已恢复隐藏消息。' : '当前没有隐藏消息。'
  }
}

export function getCollapseState(): {
  enabled: boolean
  keepLatest: number
  collapsedCount: number
} {
  return { enabled, keepLatest, collapsedCount: getCollapsedNodes().length }
}

function handleRouteChange(): void {
  restoreMessages()
  window.setTimeout(() => {
    if (enabled) emitVisibilityChange()
  }, 350)
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

function applyEnabledState(): void {
  if (!enabled) restoreMessages()
}

export const collapse = {
  setKeepLatest(value: number): void {
    keepLatest = normalizeKeepLatest(value)
  },

  async enable(siteAdapter: SiteAdapter): Promise<void> {
    if (enabled) return
    enabled = true
    adapter = siteAdapter
    const settings = await readSettings()
    keepLatest = normalizeKeepLatest(settings.collapseKeepLatest)
    hookRouteChangesOnce()
    applyEnabledState()
    console.log('[ChatGo] 长对话折叠已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    restoreMessages()
    console.log('[ChatGo] 长对话折叠已关闭。')
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

// 全局暴露，供悬浮窗面板调用
declare global {
  interface Window {
    ChatGoCollapse?: typeof collapse
  }
}
window.ChatGoCollapse = collapse
