import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isGeminiBranchActionLabel,
  isGeminiMoreOptionsLabel
} from './gemini-native-branch.ts'

test('recognizes Gemini response menu labels in supported languages', () => {
  assert.equal(isGeminiMoreOptionsLabel('Show more options'), true)
  assert.equal(isGeminiMoreOptionsLabel('显示更多选项'), true)
  assert.equal(isGeminiMoreOptionsLabel('更多選項'), true)
  assert.equal(isGeminiMoreOptionsLabel('Upload & tools'), false)
})

test('recognizes Gemini native branch actions without matching unrelated menu items', () => {
  assert.equal(isGeminiBranchActionLabel('Branch in a new chat'), true)
  assert.equal(isGeminiBranchActionLabel('Branch in new chat'), true)
  assert.equal(isGeminiBranchActionLabel('Branch to new chat'), true)
  assert.equal(isGeminiBranchActionLabel('在新对话中创建分支'), true)
  assert.equal(isGeminiBranchActionLabel('在新聊天中创建分支'), true)
  assert.equal(isGeminiBranchActionLabel('Report legal issue'), false)
  assert.equal(isGeminiBranchActionLabel('See response details'), false)
})
