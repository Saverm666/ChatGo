import assert from 'node:assert/strict'
import test from 'node:test'
import { BRANCH_DRAFT_TTL_MS } from '../main/constants.ts'
import type { BranchPromptDraft } from '../main/types.ts'
import { canTabConsumeBranchDraft, isFreshBranchDraft } from './branch-draft.ts'

const now = 1_000_000

function createDraft(overrides: Partial<BranchPromptDraft> = {}): BranchPromptDraft {
  return {
    text: '> quoted text\n\n',
    sourceTurnId: 'message-id',
    sourcePath: '/c/source-conversation',
    sourceUrl: 'https://chatgpt.com/c/source-conversation',
    sourceTabId: 12,
    createdAt: now,
    ...overrides
  }
}

test('only the explicitly bound target tab can consume a branch draft', () => {
  const draft = createDraft({ targetTabId: 34 })
  assert.equal(canTabConsumeBranchDraft(draft, 34), true)
  assert.equal(canTabConsumeBranchDraft(draft, 35), false)
  assert.equal(canTabConsumeBranchDraft(draft, 12), false)
})

test('an unbound draft cannot leak into another new conversation', () => {
  assert.equal(canTabConsumeBranchDraft(createDraft(), 34), false)
})

test('rejects expired branch drafts', () => {
  assert.equal(isFreshBranchDraft(createDraft(), now + BRANCH_DRAFT_TTL_MS - 1), true)
  assert.equal(isFreshBranchDraft(createDraft(), now + BRANCH_DRAFT_TTL_MS), false)
})
