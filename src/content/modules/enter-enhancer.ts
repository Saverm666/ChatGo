// 输入增强模块：Enter 换行，Ctrl+Enter 发送

import type { SiteAdapter } from '@/main/types'

let enabled = false
let adapter: SiteAdapter | null = null

const EDITABLE_SELECTOR =
  'textarea, div[contenteditable="true"], [contenteditable="plaintext-only"]'

// ChatGPT 新版外壳（octane）把输入框换成了原生 textarea，浏览器不会对
// 脚本派发的合成 keydown 执行默认换行行为，因此这里手工计算换行结果。
export function applyTextareaLineBreak(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length))
  const end = Math.max(start, Math.min(selectionEnd, value.length))
  return {
    value: `${value.slice(0, start)}\n${value.slice(end)}`,
    caret: start + 1
  }
}

// “停止生成”态下发送按钮会被复用，Ctrl+Enter 不应触发中断。
export function isStopGeneratingLabel(label: string | null | undefined): boolean {
  const normalized = String(label ?? '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return false
  return normalized.includes('stop') || normalized.includes('停止')
}

function createKeyEvent(type: string, options: {
  key?: string
  code?: string
  keyCode?: number
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    key: options.key ?? 'Enter',
    code: options.code ?? 'Enter',
    keyCode: options.keyCode ?? 13,
    shiftKey: Boolean(options.shiftKey),
    ctrlKey: Boolean(options.ctrlKey),
    altKey: Boolean(options.altKey),
    metaKey: Boolean(options.metaKey),
    bubbles: true,
    cancelable: true
  }) as KeyboardEvent & { which?: number }
  Object.defineProperty(event, 'isTriggeredByScript', { value: true, writable: false })
  return event
}

function simulateAdvancedEnter(target: HTMLElement): void {
  target.focus()
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertLineBreak',
    data: null
  })
  target.dispatchEvent(beforeInput)
  if (!beforeInput.defaultPrevented) {
    target.dispatchEvent(createKeyEvent('keydown', {}))
    target.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertLineBreak' })
    )
    target.dispatchEvent(createKeyEvent('keyup', {}))
  }
}

// 原生 textarea 需要真正改写 value，否则 Enter 在“换行”语义下会没有任何反应。
function insertLineBreakInTextarea(textarea: HTMLTextAreaElement): void {
  textarea.focus()
  let inserted = false
  try {
    inserted = document.execCommand('insertLineBreak')
  } catch {
    inserted = false
  }
  if (!inserted) {
    const next = applyTextareaLineBreak(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
      textarea.selectionEnd ?? textarea.value.length
    )
    textarea.value = next.value
    try {
      textarea.setSelectionRange(next.caret, next.caret)
    } catch {
      // 某些只读/特殊输入框不支持设置选区，忽略即可。
    }
    textarea.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertLineBreak' })
    )
  }
}

function isUsableSendButton(button: HTMLButtonElement): boolean {
  if (button.disabled) return false
  if (button.hasAttribute('data-stop-generating')) return false
  if (isStopGeneratingLabel(button.getAttribute('aria-label'))) return false
  return button.getClientRects().length > 0
}

// 发送按钮优先在输入框所属 <form> 内解析：
// ChatGPT 新版把 data-testid="send-button" 换成了 button[data-composer-submit]，
// 只靠全局 aria/type 选择器容易误命中登录表单等其它提交按钮。
function findSendButton(composer?: HTMLElement | null): HTMLButtonElement | null {
  const form = composer?.closest('form')
  if (form) {
    const scoped = form.querySelectorAll(
      '[data-composer-submit], button[type="submit"], button[aria-label*="Send"], button[aria-label*="发送"]'
    )
    for (const candidate of scoped) {
      if (candidate instanceof HTMLButtonElement && isUsableSendButton(candidate)) return candidate
    }
  }
  if (adapter?.selectors.sendButton) {
    for (const candidate of document.querySelectorAll(adapter.selectors.sendButton)) {
      if (candidate instanceof HTMLButtonElement && isUsableSendButton(candidate)) return candidate
    }
  }
  // 通用回退：找带 send 图标/aria 的按钮
  const candidates = document.querySelectorAll(
    'button[aria-label*="Send"], button[aria-label*="发送"], button[type="submit"]'
  )
  for (const c of candidates) {
    if (c instanceof HTMLButtonElement && isUsableSendButton(c)) return c
  }
  return null
}

function getEditableTarget(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  if (!(el instanceof Element)) return null
  const editable = el.closest(EDITABLE_SELECTOR)
  if (!(editable instanceof HTMLElement) || editable.getClientRects().length === 0) return null
  return editable
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.altKey || event.metaKey || event.shiftKey) return
  const editableTarget = getEditableTarget(event.target)
  if ((event as KeyboardEvent & { isTriggeredByScript?: boolean }).isTriggeredByScript || !editableTarget) {
    return
  }

  if (event.ctrlKey) {
    event.preventDefault()
    event.stopImmediatePropagation()
    const sendButton = findSendButton(editableTarget)
    if (sendButton && !sendButton.disabled) {
      sendButton.click()
      return
    }
    simulateAdvancedEnter(editableTarget)
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()
  if (editableTarget instanceof HTMLTextAreaElement) {
    insertLineBreakInTextarea(editableTarget)
    return
  }
  editableTarget.dispatchEvent(createKeyEvent('keydown', { key: 'Enter', shiftKey: true }))
}

function blockEnterPropagation(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  if ((event as KeyboardEvent & { isTriggeredByScript?: boolean }).isTriggeredByScript) return
  if (!getEditableTarget(event.target)) return
  if (
    event.key === 'Enter' &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}

export const enterEnhancer = {
  enable(siteAdapter: SiteAdapter): void {
    if (enabled) return
    enabled = true
    adapter = siteAdapter
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keypress', blockEnterPropagation, true)
    document.addEventListener('keyup', blockEnterPropagation, true)
    console.log('[ChatGo] Enter 增强已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    adapter = null
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('keypress', blockEnterPropagation, true)
    document.removeEventListener('keyup', blockEnterPropagation, true)
    console.log('[ChatGo] Enter 增强已关闭。')
  }
}
