// ChatGPT 适配器

import type { SiteAdapter } from '@/main/types'

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  match(url: URL): boolean {
    const h = url.hostname
    return h.includes('chatgpt.com') || h.includes('chat.openai.com')
  },
  selectors: {
    messageRoot: '#thread, main#main, main, [role="main"]',
    messageTurn: 'section[data-turn][data-turn-id], [data-turn][data-turn-id], [data-testid^="conversation-turn-"]',
    userMessage: '[data-message-author-role="user"], [data-testid^="user-message"]',
    assistantMessage: '[data-message-author-role="assistant"], [data-testid^="assistant-message"]',
    composer: '#prompt-textarea[contenteditable="true"]',
    sendButton: 'button[data-testid="send-button"]',
    formulaContainer: '.katex, .katex-display, mjx-container, cib-math'
  },
  getNewConversationUrl(): string {
    return 'https://chatgpt.com/'
  }
}
