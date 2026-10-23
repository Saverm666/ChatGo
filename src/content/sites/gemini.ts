// Google Gemini 适配器

import type { SiteAdapter } from '@/main/types'

export const GEMINI_RESPONSE_SELECTOR = 'model-response, [class*="model-response"]'
const GEMINI_RESPONSE_ID_SELECTOR = 'message-content[id], [id^="model-response-message-content"], [data-response-id]'
const GEMINI_RESPONSE_METADATA_SELECTOR = '[jslog*="BardVeMetadataKey"]'
export const GEMINI_COMPOSER_SELECTOR = 'rich-textarea [contenteditable="true"], rich-textarea textarea, [role="textbox"][contenteditable="true"], div[contenteditable="true"], textarea'

export function findGeminiBranchSource(turn: HTMLElement | null, pageUrl: string): { conversationId: string; turnId: string } | null {
  const page = new URL(pageUrl)
  const route = page.pathname.match(/^(?:\/u\/\d+)?\/app\/([\w-]+)\/?$/)
  if (page.origin !== 'https://gemini.google.com' || !route || !turn) return null
  const response = turn.matches(GEMINI_RESPONSE_SELECTOR) ? turn : turn.closest(GEMINI_RESPONSE_SELECTOR)
  if (!response) return null
  const conversationId = `c_${route[1]}`
  const ids = [...response.querySelectorAll(GEMINI_RESPONSE_ID_SELECTOR)]
    .map((node) => node.getAttribute('data-response-id') ?? node.id)
    .flatMap((id) => id.match(/r_[a-zA-Z0-9_-]+$/) ?? [])
  if (new Set(ids).size === 1) return { conversationId, turnId: ids[0] }
  // Gemini logs reply/conversation identity in structured element metadata.
  // Read only metadata on this response; never search arbitrary message text.
  const metadata = [...response.querySelectorAll(GEMINI_RESPONSE_METADATA_SELECTOR)]
  if (response.matches(GEMINI_RESPONSE_METADATA_SELECTOR)) metadata.unshift(response)
  for (const node of metadata) {
    const match = node.getAttribute('jslog')?.match(/BardVeMetadataKey:(\[.*\]);mutable:/)
    if (!match) continue
    try {
      const value = JSON.parse(match[1])
      const row = Array.isArray(value) ? value[0] : null
      if (Array.isArray(row) && row[1] === conversationId && typeof row[0] === 'string' && /^r_[\w-]+$/.test(row[0])) {
        return { conversationId, turnId: row[0] }
      }
    } catch { /* Incomplete metadata must not produce an invented turn ID. */ }
  }
  return null
}

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  name: 'Gemini',
  match(url: URL): boolean {
    return url.hostname === 'gemini.google.com'
  },
  selectors: {
    messageRoot: 'chat-window, main, [role="main"]',
    messageTurn: 'model-response, user-query, [class*="conversation-turn"]',
    userMessage: 'user-query, [class*="user-query"]',
    assistantMessage: 'model-response, [class*="model-response"]',
    composer: GEMINI_COMPOSER_SELECTOR,
    sendButton: 'button[aria-label*="Send"], button[aria-label*="发送"], send-button',
    formulaContainer: '.katex, .katex-display, mjx-container, cib-math'
  },
  getNewConversationUrl(url: URL): string {
    const account = url.pathname.match(/^\/u\/\d+(?=\/)/)?.[0] ?? ''
    return `${url.origin}${account}/app`
  }
}
