// 输入增强模块：Enter 换行，Ctrl+Enter 发送

import type { SiteAdapter } from '@/main/types'

let enabled = false
let adapter: SiteAdapter | null = null

const EDITABLE_SELECTOR =
  'textarea, div[contenteditable="true"], [contenteditable="plaintext-only"]'

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

function findSendButton(): HTMLButtonElement | null {
  if (adapter?.selectors.sendButton) {
    const btn = document.querySelector(adapter.selectors.sendButton)
    if (btn instanceof HTMLButtonElement) return btn
  }
  // 通用回退：找带 send 图标/aria 的按钮
  const candidates = document.querySelectorAll(
    'button[aria-label*="Send"], button[aria-label*="发送"], button[type="submit"]'
  )
  for (const c of candidates) {
    if (c instanceof HTMLButtonElement && c.getClientRects().length > 0) return c
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
  const editableTarget = getEditableTarget(event.target)
  if ((event as KeyboardEvent & { isTriggeredByScript?: boolean }).isTriggeredByScript || !editableTarget) {
    return
  }
  if (event.key !== 'Enter' || event.altKey || event.metaKey || event.shiftKey) return

  if (event.ctrlKey) {
    event.preventDefault()
    event.stopImmediatePropagation()
    const sendButton = findSendButton()
    if (sendButton && !sendButton.disabled) {
      sendButton.click()
      return
    }
    simulateAdvancedEnter(editableTarget)
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()
  editableTarget.dispatchEvent(createKeyEvent('keydown', { key: 'Enter', shiftKey: true }))
}

function blockEnterPropagation(event: KeyboardEvent): void {
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
