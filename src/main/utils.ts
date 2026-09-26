// 通用工具函数

// 生成唯一 ID
export function createItemId(prefix = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// 规范化空白
export function normalizeWhitespace(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

// 截断文本
export function truncateText(value: string, maxLength = 90): string {
  const normalized = normalizeWhitespace(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

// 格式化时间戳
export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return ''
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp))
  } catch {
    return ''
  }
}

// 等待值出现（轮询）
export function waitForValue<T>(
  resolveValue: () => T | null | undefined,
  options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}
): Promise<T | null> {
  const timeoutMs = options.timeoutMs ?? 3000
  const intervalMs = options.intervalMs ?? 60
  const startTime = Date.now()

  return new Promise((resolve) => {
    let timer: number | undefined
    let settled = false
    const finish = (value: T | null): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const onAbort = (): void => finish(null)
    if (options.signal?.aborted) return finish(null)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    function check(): void {
      if (options.signal?.aborted) return finish(null)
      let value: T | null | undefined = null
      try {
        value = resolveValue()
      } catch {
        value = null
      }
      if (settled) return
      if (value) {
        finish(value as T)
        return
      }
      if (Date.now() - startTime >= timeoutMs) {
        finish(null)
        return
      }
      timer = window.setTimeout(check, intervalMs)
    }
    check()
  })
}

// 延时
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// 元素是否在视口可见
export function isElementVisibleInViewport(element: Element | null): boolean {
  if (!(element instanceof Element)) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

// 复制到剪贴板（带 execCommand 回退）
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 回退到 execCommand
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  ;(document.body ?? document.documentElement).appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

// 规范化公式复制格式
export function normalizeFormulaCopyFormat(
  value: unknown,
  fallback: 'latex' | 'unicode-math' | 'latex-source' = 'latex-source'
): 'latex' | 'unicode-math' | 'latex-source' {
  if (value === 'latex' || value === 'unicode-math' || value === 'latex-source') return value
  if (value === 'mathml') return 'unicode-math'
  return fallback
}

// 规范化 Markdown 公式包裹模式
export function normalizeMarkdownFormulaWrapMode(
  value: unknown,
  fallback: 'with-delimiters' | 'bare' = 'with-delimiters'
): 'with-delimiters' | 'bare' {
  if (value === 'with-delimiters' || value === 'bare') return value
  return fallback
}

// 规范化保留最近轮数
export function normalizeKeepLatest(value: unknown, fallback = 20): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(Math.max(Math.trunc(num), 1), 1000)
}

// 真实用户点击元素时浏览器派发的事件序列。
// 只派发 click 事件无法触发那些只监听 pointerdown 的组件（例如 Radix 菜单触发器），
// 所以点击站点原生控件时统一走完整序列。
export const USER_CLICK_EVENT_SEQUENCE: ReadonlyArray<{
  type: string
  pointer: boolean
  buttons: number
}> = [
  { type: 'pointerover', pointer: true, buttons: 0 },
  { type: 'pointerenter', pointer: true, buttons: 0 },
  { type: 'pointermove', pointer: true, buttons: 0 },
  { type: 'pointerdown', pointer: true, buttons: 1 },
  { type: 'mousedown', pointer: false, buttons: 1 },
  { type: 'pointerup', pointer: true, buttons: 0 },
  { type: 'mouseup', pointer: false, buttons: 0 },
  { type: 'click', pointer: false, buttons: 0 }
]

function createUserEventInit(element: Element, buttons: number): PointerEventInit {
  const rect = element.getBoundingClientRect()
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    buttons,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse'
  }
}

function dispatchUserEventSequence(
  element: Element,
  sequence: ReadonlyArray<{ type: string; pointer: boolean; buttons: number }>
): void {
  for (const step of sequence) {
    const init = createUserEventInit(element, step.buttons)
    element.dispatchEvent(step.pointer ? new PointerEvent(step.type, init) : new MouseEvent(step.type, init))
  }
}

// 模拟一次完整的人工点击（含 pointerdown），能触发只监听 pointerdown 的组件。
export function dispatchUserClick(element: Element): void {
  dispatchUserEventSequence(element, USER_CLICK_EVENT_SEQUENCE)
}

// 把适配器的选择器列表拆成“书写顺序”的分支数组。
// 不能直接 split(',')：分支里可能出现 :not(…) / [attr="a,b"] 这类带逗号的片段。
export function listSelectorAlternatives(selector: string | null | undefined): string[] {
  if (!selector) return []
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null
  for (const character of selector) {
    if (quote) {
      current += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(' || character === '[') depth += 1
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  parts.push(current.trim())
  return parts.filter(Boolean)
}
