import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChatGptBranchUrl } from './chatgpt-branch-route.ts'

test('builds the native ChatGPT branch route from a conversation URL', () => {
  assert.equal(
    buildChatGptBranchUrl(
      'https://chatgpt.com/c/conversation-id',
      'message-id'
    ),
    'https://chatgpt.com/branch/conversation-id/message-id'
  )
})

test('supports GPT conversation paths', () => {
  assert.equal(
    buildChatGptBranchUrl(
      'https://chatgpt.com/g/gizmo-id/c/conversation-id',
      'message-id'
    ),
    'https://chatgpt.com/branch/conversation-id/message-id'
  )
})

test('preserves temporary-chat behavior used by the native frontend', () => {
  assert.equal(
    buildChatGptBranchUrl(
      'https://chatgpt.com/c/conversation-id?training_disabled=true',
      'message-id'
    ),
    'https://chatgpt.com/branch/conversation-id/message-id?temporary-chat=true'
  )
})

test('rejects pages without a conversation or message id', () => {
  assert.equal(buildChatGptBranchUrl('https://chatgpt.com/', 'message-id'), null)
  assert.equal(buildChatGptBranchUrl('https://chatgpt.com/c/conversation-id', '  '), null)
})
