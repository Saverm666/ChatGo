import { BRANCH_DRAFT_TTL_MS } from '../main/constants.ts'
import type { BranchPromptDraft } from '../main/types.ts'

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
