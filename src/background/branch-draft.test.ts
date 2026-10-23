import assert from 'node:assert/strict'
import test from 'node:test'
import { BRANCH_DRAFT_TTL_MS } from '../main/constants.ts'
import type { BranchPromptDraft } from '../main/types.ts'
import {
  canTabConsumeBranchDraft,
  canTabConsumeNativeChatGptDraft,
  canTabConsumeNativeGeminiDraft,
  isFreshBranchDraft
} from './branch-draft.ts'

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

test('Gemini drafts never fill the source tab, even after a route change', () => {
  const draft = createDraft({
    strategy: 'native-gemini',
    sourceUrl: 'https://gemini.google.com/app/source-chat',
    sourcePath: '/app/source-chat'
  })
  assert.equal(
    canTabConsumeNativeGeminiDraft(draft, {
      tabId: 12,
      url: 'https://gemini.google.com/app/branched-chat'
    }),
    false
  )
  assert.equal(
    canTabConsumeNativeGeminiDraft(draft, {
      tabId: 12,
      url: 'https://gemini.google.com/app/source-chat'
    }),
    false
  )
})

test('only the bound Gemini target tab can consume the draft on a different chat URL', () => {
  const draft = createDraft({
    strategy: 'native-gemini',
    sourceUrl: 'https://gemini.google.com/app/source-chat',
    sourcePath: '/app/source-chat',
    targetTabId: 34
  })
  assert.equal(
    canTabConsumeNativeGeminiDraft(draft, {
      tabId: 34,
      openerTabId: 12,
      url: 'https://gemini.google.com/app/branched-chat'
    }),
    true
  )
  assert.equal(
    canTabConsumeNativeGeminiDraft(draft, {
      tabId: 35,
      openerTabId: 99,
      url: 'https://gemini.google.com/app/branched-chat'
    }),
    false
  )
  assert.equal(
    canTabConsumeNativeGeminiDraft(draft, {
      tabId: 12,
      url: 'https://example.com/app/branched-chat'
    }),
    false
  )
})

test('allows a native ChatGPT branch draft only from the source tab and for chatgpt.com', () => {
  const draft = createDraft({
    strategy: 'native-chatgpt',
    sourceUrl: 'https://chatgpt.com/c/source-conversation',
    sourcePath: '/c/source-conversation'
  })
  // 新版外壳可能在新标签页打开分支
  assert.equal(
    canTabConsumeNativeChatGptDraft(draft, {
      tabId: 34,
      openerTabId: 12,
      url: 'https://chatgpt.com/c/branched-conversation'
    }),
    true
  )
  // 也可能在当前标签页内 SPA 路由
  assert.equal(
    canTabConsumeNativeChatGptDraft(draft, {
      tabId: 12,
      url: 'https://chatgpt.com/c/branched-conversation'
    }),
    true
  )
  // 原对话地址不算分支
  assert.equal(
    canTabConsumeNativeChatGptDraft(draft, {
      tabId: 12,
      url: 'https://chatgpt.com/c/source-conversation'
    }),
    false
  )
  // 无关标签页
  assert.equal(
    canTabConsumeNativeChatGptDraft(draft, {
      tabId: 77,
      openerTabId: 99,
      url: 'https://chatgpt.com/c/branched-conversation'
    }),
    false
  )
  // 跨站
  assert.equal(
    canTabConsumeNativeChatGptDraft(draft, {
      tabId: 12,
      url: 'https://gemini.google.com/c/branched-conversation'
    }),
    false
  )
  // 策略不匹配时不得消费
  assert.equal(
    canTabConsumeNativeChatGptDraft(createDraft({ strategy: 'native-gemini' }), {
      tabId: 12,
      url: 'https://chatgpt.com/c/branched-conversation'
    }),
    false
  )
})
