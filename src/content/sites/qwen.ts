import type { SiteAdapter } from '@/main/types'

export const qwenAdapter: SiteAdapter = {
  id: 'qwen',
  name: 'Qwen',
  match(url: URL): boolean {
    return url.hostname === 'chat.qwen.ai'
  },
  selectors: {
    messageRoot: '#chat-messages-scroll-container, #chat-message-container, main',
    messageTurn: '.qwen-chat-message',
    userMessage: '.qwen-chat-message-user',
    assistantMessage: '.qwen-chat-message-assistant, .chat-response-message',
    composer: 'textarea.message-input-textarea',
    sendButton: 'button.send-button, .chat-prompt-send-button button',
    formulaContainer: '.katex, .katex-display, mjx-container, math, [role="math"]'
  },
  getNewConversationUrl(): string {
    return 'https://chat.qwen.ai/'
  }
}
