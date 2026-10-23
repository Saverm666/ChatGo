import assert from 'node:assert/strict'
import test from 'node:test'
import { isGeminiBranchDestination } from './gemini-route.ts'

test('only a different Gemini chat in the same account is a native branch destination', () => {
  assert.equal(isGeminiBranchDestination('https://gemini.google.com/app/source', 'https://gemini.google.com/app/branch'), true)
  assert.equal(isGeminiBranchDestination('https://gemini.google.com/u/0/app/source?hl=zh', 'https://gemini.google.com/u/0/app/branch'), true)
  for (const target of [
    'https://gemini.google.com/u/0/app/source?hl=en',
    'https://gemini.google.com/u/0/app/source#branch',
    'https://gemini.google.com/u/0/app',
    'https://gemini.google.com/u/1/app/branch',
    'https://gemini.google.com/app/branch',
    'https://example.com/u/0/app/branch'
  ]) assert.equal(isGeminiBranchDestination('https://gemini.google.com/u/0/app/source', target), false, target)
})
