import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildChatGptBranchUrl,
  getChatGptBranchScopeFromUrl,
  isLocalChatGptConversationUrl
} from './chatgpt-branch-route.ts'

test('builds the native ChatGPT branch route from a conversation URL', () => {
  assert.equal(
    buildChatGptBranchUrl(
      'https://chatgpt.com/c/conversation-id',
      'message-id'
    ),
    'https://chatgpt.com/branch/conversation-id/message-id'
  )
})

test('work branches keep the selected surface', () => {
  assert.equal(
    buildChatGptBranchUrl('https://chatgpt.com/c/conversation-id', 'message-id', 'work'),
    'https://chatgpt.com/branch/conversation-id/message-id?surface=work'
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

test('does not branch from an unsaved local ChatGPT conversation', () => {
  const localUrl = 'https://chatgpt.com/c/local-chatgpt%3A2c8a164a-bcde-4bc0-8b21-30e03dd5d797'
  assert.equal(isLocalChatGptConversationUrl(localUrl), true)
  assert.equal(buildChatGptBranchUrl(localUrl, '635e7e7b-4e65-4844-a965-e0fbaa3bd02b'), null)
  assert.equal(isLocalChatGptConversationUrl(localUrl.replace('%3A', '%253A')), true)
  assert.equal(buildChatGptBranchUrl(localUrl.replace('%3A', '%253A'), 'message-id'), null)
})

test('encodes a persisted conversation id exactly once', () => {
  assert.equal(
    buildChatGptBranchUrl('https://chatgpt.com/c/server%3Aid', 'message-id'),
    'https://chatgpt.com/branch/server%3Aid/message-id'
  )
})

test('分支作用域跟随当前上下文', () => {
  assert.equal(getChatGptBranchScopeFromUrl('https://chatgpt.com/c/abc'), 'chat')
  assert.equal(getChatGptBranchScopeFromUrl('https://chatgpt.com/c/abc?surface=work'), 'work')
  assert.equal(getChatGptBranchScopeFromUrl('https://chatgpt.com/c/abc?surface=Work'), 'work')
  assert.equal(getChatGptBranchScopeFromUrl('https://chatgpt.com/work/c/abc'), 'work')
  assert.equal(getChatGptBranchScopeFromUrl('not-a-url'), 'chat')
})
