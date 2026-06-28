import type { PromptDraft } from '@/main/types'

const DRAFT_DEBOUNCE_MS = 2500

export function buildDraftKey(promptId: string): string {
  return promptId ? `edit:${promptId}` : 'new'
}

export function createDraft(
  key: string,
  promptId: string,
  name: string,
  category: string,
  tagsInput: string,
  content: string,
  splitRatio?: number
): PromptDraft {
  return {
    key,
    promptId,
    name,
    category,
    tagsInput,
    content,
    splitRatio: splitRatio ?? 0.5,
    mode: 'split',
    updatedAt: Date.now()
  }
}

export function debounceSaveDraft(
  save: (draft: PromptDraft) => void,
  ms = DRAFT_DEBOUNCE_MS
): (draft: PromptDraft) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (draft: PromptDraft) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      save(draft)
      timer = null
    }, ms)
  }
}

// 识别旧版带时间戳的 new 草稿 key（现版本固定为 'new'），用于一次性清理
export function legacyNewDraftKeys(drafts: Record<string, PromptDraft>): string[] {
  return Object.keys(drafts).filter((k) => k.startsWith('new:'))
}
