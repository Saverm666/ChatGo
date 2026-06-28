// LobeChat 适配器

import type { SiteAdapter } from '@/main/types'

export const lobechatAdapter: SiteAdapter = {
  id: 'lobechat',
  name: 'LobeChat',
  match(url: URL): boolean {
    return (
      url.hostname.includes('lobechat.com') ||
      url.hostname.includes('lobehub.com') ||
      url.pathname.includes('lobechat')
    )
  },
  selectors: {
    messageRoot: '[class*="chat"], main, [role="main"]',
    messageTurn: '[class*="message"], [class*="conversation-item"]',
    userMessage: '[class*="user-message"], [class*="msg-user"]',
    assistantMessage: '[class*="assistant-message"], [class*="msg-assistant"]',
    composer: 'textarea[placeholder*="问"], textarea[placeholder*="输入"], div[contenteditable="true"], textarea',
    sendButton: 'button[aria-label*="Send"], button[aria-label*="发送"], [class*="send"]',
    formulaContainer: '.katex, .katex-display, mjx-container'
  },
  getNewConversationUrl(url: URL): string {
    return `${url.origin}/chat`
  }
}
