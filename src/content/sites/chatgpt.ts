// ChatGPT 适配器

import type { SiteAdapter } from '@/main/types'

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  match(url: URL): boolean {
    return url.hostname === 'chatgpt.com'
  },
  selectors: {
    messageRoot: '#thread, main#main, main, [role="main"]',
    messageTurn:
      'article[data-testid^="conversation-turn-"], section[data-turn][data-turn-id], [data-turn][data-turn-id], [data-testid^="conversation-turn-"]',
    userMessage:
      '[data-message-author-role="user"], [data-testid^="user-message"], article[data-testid^="conversation-turn-"]:has([data-message-author-role="user"])',
    assistantMessage:
      '[data-message-author-role="assistant"], [data-testid^="assistant-message"], article[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
    composer:
      '#prompt-textarea, textarea#prompt-textarea, div#prompt-textarea[contenteditable="true"], div.ProseMirror[contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"], textarea[data-testid="prompt-textarea"], textarea[placeholder*="Message"], textarea[placeholder*="Ask"], div[contenteditable="true"]',
    sendButton:
      'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label*="Send"], button[aria-label*="发送"], button[type="submit"]',
    formulaContainer: '.katex, .katex-display, mjx-container, cib-math, math, [role="math"]'
  },
  getNewConversationUrl(): string {
    return 'https://chatgpt.com/'
  }
}
