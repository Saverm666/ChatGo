// NextChat / ChatGPT-Next-Web / 通用中转站前端适配器
// 这类前端基于 Next.js，DOM 结构相对统一

import type { SiteAdapter } from '@/main/types'

// NextChat 系列常见路径特征：根路径或 /c/<id>
function looksLikeNextChat(url: URL): boolean {
  return /^\/(c\/|$)/.test(url.pathname) || url.pathname === '/'
}

export const nextchatAdapter: SiteAdapter = {
  id: 'nextchat',
  name: 'NextChat / ChatGPT-Next-Web',
  match(url: URL): boolean {
    // 无法仅靠域名判定，靠路径特征 + 常见元素；这里宽松匹配，最终由选择器兜底
    return looksLikeNextChat(url) && url.hostname !== 'chatgpt.com' && url.hostname !== 'chat.openai.com'
  },
  selectors: {
    messageRoot: 'main, .window-content, [class*="chat"]',
    messageTurn: '.message, [class*="message-item"]',
    userMessage: '.message[type="user"], [class*="user-message"], [class*="msg-user"]',
    assistantMessage: '.message[type="assistant"], [class*="assistant-message"], [class*="msg-assistant"]',
    composer: 'textarea#chat-input, textarea[placeholder*="问"], textarea[placeholder*="输入"], textarea',
    sendButton: 'button[aria-label*="Send"], button[aria-label*="发送"], [class*="send"]',
    formulaContainer: '.katex, .katex-display, mjx-container'
  },
  getNewConversationUrl(url: URL): string {
    return `${url.origin}/`
  }
}
