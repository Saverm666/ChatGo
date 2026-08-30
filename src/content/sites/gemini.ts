// Google Gemini 适配器

import type { SiteAdapter } from '@/main/types'

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  name: 'Gemini',
  match(url: URL): boolean {
    return url.hostname === 'gemini.google.com'
  },
  selectors: {
    messageRoot: 'chat-window, main, [role="main"]',
    messageTurn: 'model-response, user-query, message-content, [class*="conversation-turn"]',
    userMessage: 'user-query, [class*="user-query"]',
    assistantMessage: 'model-response, [class*="model-response"]',
    composer: 'rich-textarea, div[contenteditable="true"], textarea',
    sendButton: 'button[aria-label*="Send"], button[aria-label*="发送"], send-button',
    formulaContainer: '.katex, .katex-display, mjx-container, cib-math'
  },
  getNewConversationUrl(url: URL): string {
    return `${url.origin}${url.pathname}`
  }
}
