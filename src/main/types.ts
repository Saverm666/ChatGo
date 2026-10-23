// ChatGo 共享类型定义

// 公式复制格式
export type FormulaCopyFormat = 'latex' | 'unicode-math' | 'latex-source'

// Markdown 公式包裹模式
export type MarkdownFormulaWrapMode = 'with-delimiters' | 'bare'

// 站点启用模式
export type SiteActivationMode = 'common-ai-only' | 'all-sites' | 'disabled'

// 提示词条目
export interface SavedPrompt {
  id: string
  name: string
  content: string
  pinned: boolean
  updatedAt: number
  category?: string
  tags?: string[]
  createdAt?: number
  lastUsedAt?: number
  usedCount?: number
}

// 提示词编辑草稿
export interface PromptDraft {
  key: string
  promptId: string
  name: string
  category: string
  tagsInput: string
  content: string
  splitRatio: number
  mode: 'split' | 'source' | 'render'
  updatedAt: number
}

// 公式历史条目
export interface FormulaHistoryEntry {
  text: string
  latexSource: string
  format: FormulaCopyFormat
  copiedAt: number
  sourceTitle: string
  sourceUrl: string
}

// 分支提问草稿（service-worker 中转）
export interface BranchPromptDraft {
  diagnosticId?: string
  text: string
  nativeQuote?: {
    label: string
    markdown: string
  }
  sourceTurnId: string
  sourcePath: string
  sourceUrl: string
  sourceTabId: number
  targetTabId?: number
  strategy?: 'linked-tab' | 'native-gemini' | 'native-chatgpt'
  createdAt: number
}

// 站点适配器选择器
export interface SiteSelectors {
  messageRoot?: string
  messageTurn?: string
  userMessage?: string
  assistantMessage?: string
  composer?: string
  sendButton?: string
  formulaContainer?: string
  nativeConversationNavigator?: string
}

// 站点适配器接口
export interface SiteAdapter {
  id: string
  name: string
  match(url: URL): boolean
  selectors: SiteSelectors
  // 分支提问：返回该站点新建对话的 URL
  getNewConversationUrl?(url: URL): string
}

// 全局设置
export interface ChatGoSettings {
  siteActivationMode: SiteActivationMode
  siteWhitelist: string[]
  siteBlacklist: string[]
  formulaCopierEnabled: boolean
  formulaCopyFormat: FormulaCopyFormat
  markdownCopyEnabled: boolean
  markdownFormulaWrapMode: MarkdownFormulaWrapMode
  enterEnhancerEnabled: boolean
  branchEnabled: boolean
  floatingPanelEnabled: boolean
  conversationNavigatorEnabled: boolean
  floatingPanelPosition: FloatingPanelPosition | null
}

// 悬浮窗位置
export interface FloatingPanelPosition {
  x?: number
  y?: number
  xRatio?: number
  yRatio?: number
}
