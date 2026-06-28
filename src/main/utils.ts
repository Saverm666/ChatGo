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
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T | null> {
  const timeoutMs = options.timeoutMs ?? 3000
  const intervalMs = options.intervalMs ?? 60
  const startTime = Date.now()

  return new Promise((resolve) => {
    function check(): void {
      let value: T | null | undefined = null
      try {
        value = resolveValue()
      } catch {
        value = null
      }
      if (value) {
        resolve(value as T)
        return
      }
      if (Date.now() - startTime >= timeoutMs) {
        resolve(null)
        return
      }
      window.setTimeout(check, intervalMs)
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
