// 通用启发式适配器：兜底，靠自动探测常见元素

import type { SiteAdapter } from '@/main/types'

export const genericAdapter: SiteAdapter = {
  id: 'generic',
  name: '通用站点',
  match(): boolean {
    return true
  },
  selectors: {
    // 通用探测：常见聊天容器与输入框
    messageRoot: 'main, [role="main"], #root, #app, body',
    messageTurn: '[role="article"], [class*="message"], [class*="turn"], [class*="conversation"]',
    userMessage: '[class*="user-message"], [class*="msg-user"], [class*="user-msg"], [class*="human"]',
    assistantMessage:
      '[class*="assistant-message"], [class*="msg-assistant"], [class*="bot-message"], [class*="ai-message"], [class*="model"]',
    composer: 'div[contenteditable="true"], textarea[placeholder], textarea',
    sendButton: 'button[aria-label*="Send"], button[aria-label*="发送"], button[type="submit"]',
    formulaContainer: '.katex, .katex-display, mjx-container, math, [role="math"]'
  }
}
