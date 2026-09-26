// ChatGPT 适配器
//
// 2026-09 起 ChatGPT 网页端出现两套并存的前端外壳，这里同时兼容：
//
// 1) 旧版桌面端（React Router，/cdn/assets/*）：会话标签页位于 #thread，
//    轮次为 article/section[data-testid^="conversation-turn-"]，正文节点带
//    data-turn / data-turn-id / data-message-author-role / data-message-id，
//    输入框为 #prompt-textarea（ProseMirror / contenteditable）。
// 2) 新版轻量外壳（octane，unauth-mweb/*，桌面视口下 data-mobile-shell="desktop"）：
//    会话为 ol[data-conversation-transcript] > li[data-message-role="user|assistant"]，
//    助手正文为 [data-assistant-markdown]，消息 id 直接放在消息行的 id 上；
//    输入框为 form[data-mobile-composer] 内的 [data-mobile-composer-prompt]
//    （textarea#mobile-composer-prompt）或 [data-octane-lexical-root][contenteditable]，
//    发送按钮为 button[data-composer-submit]（停止生成时带 data-stop-generating）。
//
// 参考证据：artifacts/chatgpt-redesign-20260925/（实时 DOM 快照与打包代码扫描）。
//
// 3) 登录后的新版会话页（2026-09-25 Windows Chrome 实测，
//    证据 artifacts/chatgpt-latest-capture-20260925/）：
//    轮次为 `[data-turn-key]`（其值即该轮用户消息 id），用户消息为
//    `[data-user-message-bubble]`，助手消息容器为
//    `[data-chatgpt-selection-message-id]`，助手正文为 `[data-markdown-text-style="assistant-message"]`，
//    输入框为 `form[data-chatgpt-composer]` 内的 `[data-composer-markdown][contenteditable="true"]`（ProseMirror）。
//    该形态下 `data-message-role` / `data-message-author-role` / `data-message-id` /
//    `data-testid="send-button"` / `data-composer-submit` 全部不存在。
//    工作分支页（`?surface=work`）的输入框容器不是那个 form，因此输入框选择器
//    额外保留一条不带容器限定的 `[data-composer-markdown]` 精确候选。

import type { SiteAdapter } from '@/main/types'

// 会话轮次（消息行）
export const CHATGPT_MESSAGE_TURN_SELECTOR = [
  // 登录后的新版会话：一轮包含用户消息与助手回复。
  '[data-turn-key]',
  // 新版 octane 外壳
  '[data-conversation-transcript] > [data-message-role]',
  'li[data-message-role]',
  // 旧版桌面端
  'article[data-testid^="conversation-turn-"]',
  'section[data-turn][data-turn-id]',
  '[data-turn][data-turn-id]',
  '[data-testid^="conversation-turn-"]'
].join(', ')

// 用户 / 助手消息
export const CHATGPT_USER_MESSAGE_SELECTOR = [
  '[data-user-message-bubble]',
  '[data-message-role="user"]',
  '[data-message-author-role="user"]',
  '[data-testid^="user-message"]'
].join(', ')

export const CHATGPT_ASSISTANT_MESSAGE_SELECTOR = [
  '[data-chatgpt-selection-message-id]',
  '[data-message-role="assistant"]',
  '[data-message-author-role="assistant"]',
  '[data-testid^="assistant-message"]'
].join(', ')

// 输入框
//
// 注意：登录态会话页里助手回复中可能内嵌 “写作块”（writing block）——
// 它自身也是 `div.ProseMirror[contenteditable="true"]`，且排在真正的输入框之前
// （2026-09-25 实测：写作块 @294k，输入框 @466k）。因此这里必须把写作块排除掉，
// 否则按文档顺序取首个可见匹配的调用方（branch.findComposer）会误命中写作块。
export const CHATGPT_WRITING_BLOCK_EXCLUSION =
  ':not([data-oai-writing-block-surface] *):not([data-testid="chatgpt-writing-block"] *)'

export const CHATGPT_COMPOSER_SELECTOR = [
  '[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"]',
  // 不带容器限定的精确候选：从聊天/工作分支到“工作”（?surface=work）时输入框不在
  // form[data-chatgpt-composer] 内，只有这条能按 data-composer-markdown 命中真正的输入框。
  '[data-composer-markdown][contenteditable="true"]',
  // 旧版桌面端
  '#prompt-textarea',
  'textarea[name="prompt-textarea"]',
  'textarea[data-testid="prompt-textarea"]',
  `div.ProseMirror[contenteditable="true"]${CHATGPT_WRITING_BLOCK_EXCLUSION}`,
  '[contenteditable="true"][data-lexical-editor="true"]',
  // 新版 octane 外壳
  '[data-mobile-composer-prompt]',
  'textarea#mobile-composer-prompt',
  '[data-octane-lexical-root][contenteditable="true"]',
  'form[data-mobile-composer] textarea',
  '[data-composer-editor-host] textarea'
].join(', ')

// 发送按钮：排除“停止生成”状态，避免 Ctrl+Enter 误触中断。
export const CHATGPT_SEND_BUTTON_SELECTOR = [
  'button[data-composer-submit]:not([data-stop-generating])',
  'button[data-testid="send-button"]',
  'button[data-testid="composer-submit-button"]',
  'button.composer-submit-btn',
  'button[aria-label="Send message"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="发送"]'
].join(', ')

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  match(url: URL): boolean {
    return url.hostname === 'chatgpt.com'
  },
  selectors: {
    messageRoot: '#thread, main#main, [data-conversation-transcript], main, [role="main"]',
    messageTurn: CHATGPT_MESSAGE_TURN_SELECTOR,
    userMessage: CHATGPT_USER_MESSAGE_SELECTOR,
    assistantMessage: CHATGPT_ASSISTANT_MESSAGE_SELECTOR,
    composer: CHATGPT_COMPOSER_SELECTOR,
    sendButton: CHATGPT_SEND_BUTTON_SELECTOR,
    formulaContainer: '.katex, .katex-display, mjx-container, cib-math, math, [role="math"]',
    nativeConversationNavigator: [
      'button[data-toc-item-index]',
      '[data-testid*="table-of-contents" i]',
      '[data-testid*="conversation-navigator" i]',
      '[data-testid*="conversation-navigation" i]',
      '[aria-label*="table of contents" i]',
      '[aria-label*="conversation navigator" i]',
      '[aria-label*="conversation navigation" i]',
      '[aria-label*="对话目录"]',
      '[aria-label*="对话导航"]'
    ].join(', ')
  },
  getNewConversationUrl(): string {
    return 'https://chatgpt.com/'
  }
}
