import { BRANCH_DRAFT_TTL_MS } from '../main/constants.ts'
import type { BranchPromptDraft } from '../main/types.ts'
import { isGeminiBranchDestination } from '../main/gemini-route.ts'

export function isFreshBranchDraft(
  draft: BranchPromptDraft | null,
  now = Date.now()
): draft is BranchPromptDraft {
  return Boolean(
    draft &&
      typeof draft.text === 'string' &&
      draft.text.trim() &&
      typeof draft.sourceTurnId === 'string' &&
      draft.sourceTurnId &&
      typeof draft.sourceTabId === 'number' &&
      Number.isFinite(draft.sourceTabId) &&
      typeof draft.createdAt === 'number' &&
      Number.isFinite(draft.createdAt) &&
      now - draft.createdAt < BRANCH_DRAFT_TTL_MS
  )
}

export function canTabConsumeBranchDraft(
  draft: BranchPromptDraft,
  currentTabId: number | undefined
): boolean {
  return (
    typeof currentTabId === 'number' &&
    typeof draft.targetTabId === 'number' &&
    currentTabId === draft.targetTabId
  )
}

export interface NativeBranchConsumer {
  tabId?: number
  openerTabId?: number
  url?: string
}

// 原生分支（Gemini / ChatGPT 新版外壳）会把分支结果放进当前标签页的 SPA 路由
// 或一个新标签页，两种情况都要求消费方来自源标签页本身或其 opener。
export function canTabConsumeNativeBranchDraft(
  draft: BranchPromptDraft,
  consumer: NativeBranchConsumer,
  options: { strategies: readonly string[]; hostname: string }
): boolean {
  if (!draft.strategy || !options.strategies.includes(draft.strategy)) return false
  if (
    consumer.tabId !== draft.sourceTabId &&
    consumer.openerTabId !== draft.sourceTabId
  ) {
    return false
  }

  try {
    const sourceUrl = new URL(draft.sourceUrl)
    const targetUrl = new URL(consumer.url ?? '')
    return (
      sourceUrl.protocol === 'https:' &&
      sourceUrl.hostname === options.hostname &&
      targetUrl.origin === sourceUrl.origin &&
      `${targetUrl.pathname}${targetUrl.search}` !== `${sourceUrl.pathname}${sourceUrl.search}`
    )
  } catch {
    return false
  }
}

export function canTabConsumeNativeGeminiDraft(
  draft: BranchPromptDraft,
  consumer: NativeBranchConsumer
): boolean {
  return draft.strategy === 'native-gemini' && consumer.tabId !== draft.sourceTabId &&
    canTabConsumeBranchDraft(draft, consumer.tabId) &&
    isGeminiBranchDestination(draft.sourceUrl, consumer.url ?? '')
}

export function canTabConsumeNativeChatGptDraft(
  draft: BranchPromptDraft,
  consumer: NativeBranchConsumer
): boolean {
  return canTabConsumeNativeBranchDraft(draft, consumer, {
    strategies: ['native-chatgpt'],
    hostname: 'chatgpt.com'
  })
}
