import assert from 'node:assert/strict'
import test from 'node:test'
import { geminiAdapter } from './gemini.ts'

test('Gemini new chat URLs preserve the account without reopening the source conversation', () => {
  assert.equal(geminiAdapter.getNewConversationUrl?.(new URL('https://gemini.google.com/u/1/app/abc?hl=zh')), 'https://gemini.google.com/u/1/app')
  assert.equal(geminiAdapter.getNewConversationUrl?.(new URL('https://gemini.google.com/app/abc')), 'https://gemini.google.com/app')
})

test('Gemini composer candidates target editable controls instead of the rich-textarea host', () => {
  const composer = geminiAdapter.selectors.composer
  assert.ok(composer)
  assert.ok(composer.startsWith('rich-textarea [contenteditable="true"]'))
  assert.ok(!composer.split(',').some((s) => s.trim() === 'rich-textarea'))
})
