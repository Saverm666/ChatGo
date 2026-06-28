// DeepSeek 适配器

import type { SiteAdapter } from '@/main/types'

export const deepseekAdapter: SiteAdapter = {
  id: 'deepseek',
  name: 'DeepSeek',
  match(url: URL): boolean {
    return url.hostname.includes('deepseek.com')
  },
  selectors: {
    messageRoot: '#root, main, [class*="chat"]',
    messageTurn: '[class*="message"], [class*="conversation-item"]',
    userMessage: '[class*="user-message"], [class*="msg-user"]',
    assistantMessage: '[class*="assistant-message"], [class*="msg-assistant"], [class*="bot-message"]',
    composer: 'textarea#chat-input, textarea[placeholder*="问"], textarea[placeholder*="输入"], div[contenteditable="true"]',
    sendButton: 'div[role="button"][class*="send"], button[class*="send"], [class*="send-button"]',
    formulaContainer: '.katex, .katex-display, mjx-container'
  },
  getNewConversationUrl(url: URL): string {
    return `${url.origin}/chat`
  }
}
