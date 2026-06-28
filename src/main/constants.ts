// ChatGo 共享常量

import type {
  ChatGoSettings,
  FormulaCopyFormat,
  MarkdownFormulaWrapMode
} from './types'

// 存储键
export const STORAGE_KEYS = {
  SETTINGS: 'chatgo_settings',
  FORMULA_HISTORY: 'chatgo_formula_history',
  SAVED_PROMPTS: 'chatgo_saved_prompts',
  BRANCH_DRAFT: 'chatgo_branch_draft',
  PROMPT_DRAFTS: 'chatgo_prompt_drafts',
  FLOATING_POSITION: 'chatgo_floating_position'
} as const

// 公式历史最大条数
export const MAX_FORMULA_HISTORY_ITEMS = 30

// 分支草稿 TTL（2 分钟）
export const BRANCH_DRAFT_TTL_MS = 2 * 60 * 1000

// 公式复制格式标签
export const FORMULA_COPY_FORMAT_LABELS: Record<FormulaCopyFormat, string> = {
  latex: 'LaTeX（含 $）',
  'unicode-math': 'UnicodeMath (Word)',
  'latex-source': 'LaTeX（纯文本，无 $）'
}

// Markdown 公式包裹模式标签
export const MARKDOWN_FORMULA_WRAP_LABELS: Record<MarkdownFormulaWrapMode, string> = {
  'with-delimiters': '带 $ / $$',
  bare: '不带 $'
}

// 默认设置
export const DEFAULT_SETTINGS: ChatGoSettings = {
  siteActivationMode: 'common-ai-only',
  siteWhitelist: [],
  siteBlacklist: [],
  formulaCopierEnabled: true,
  formulaCopyFormat: 'latex-source',
  markdownCopyEnabled: true,
  markdownFormulaWrapMode: 'with-delimiters',
  enterEnhancerEnabled: true,
  collapseEnabled: false,
  collapseKeepLatest: 20,
  branchEnabled: true,
  floatingPanelEnabled: true,
  floatingPanelPosition: null
}

// 扩展名
export const EXTENSION_NAME = 'ChatGo'
