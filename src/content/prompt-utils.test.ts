import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterPrompts,
  markPromptUsed,
  normalizePromptTags,
  sortPrompts
} from './prompt-utils.ts'
import type { SavedPrompt } from '../main/types.ts'

const basePrompt: SavedPrompt = {
  id: 'p1',
  name: '论文总结助手',
  content: '总结论文方法和结论',
  pinned: false,
  updatedAt: 100
}

test('normalizes comma separated prompt tags', () => {
  assert.deepEqual(normalizePromptTags(' 写作, 学术，写作 ,, 代码 '), ['写作', '学术', '代码'])
})

test('filters prompts by category, tags, title and content', () => {
  const prompts: SavedPrompt[] = [
    { ...basePrompt, category: '学术', tags: ['论文', '总结'] },
    { ...basePrompt, id: 'p2', name: '代码解释', content: '解释函数', category: '代码', tags: ['调试'] }
  ]

  assert.deepEqual(filterPrompts(prompts, '论文', '全部分类').map((prompt) => prompt.id), ['p1'])
  assert.deepEqual(filterPrompts(prompts, '调试', '全部分类').map((prompt) => prompt.id), ['p2'])
  assert.deepEqual(filterPrompts(prompts, '', '代码').map((prompt) => prompt.id), ['p2'])
})

test('sorts pinned prompts first, then recently used, then recently updated', () => {
  const prompts: SavedPrompt[] = [
    { ...basePrompt, id: 'old', updatedAt: 300, lastUsedAt: 0 },
    { ...basePrompt, id: 'used', updatedAt: 100, lastUsedAt: 500 },
    { ...basePrompt, id: 'pinned', pinned: true, updatedAt: 50, lastUsedAt: 10 }
  ]

  assert.deepEqual(sortPrompts(prompts).map((prompt) => prompt.id), ['pinned', 'used', 'old'])
})

test('marks a prompt as used without changing other prompts', () => {
  const prompts: SavedPrompt[] = [basePrompt, { ...basePrompt, id: 'p2', usedCount: 4 }]
  const next = markPromptUsed(prompts, 'p2', 900)

  assert.equal(next.find((prompt) => prompt.id === 'p2')?.usedCount, 5)
  assert.equal(next.find((prompt) => prompt.id === 'p2')?.lastUsedAt, 900)
  assert.equal(next.find((prompt) => prompt.id === 'p1')?.usedCount, undefined)
})
