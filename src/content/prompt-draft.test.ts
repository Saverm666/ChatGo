import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDraftKey,
  createDraft,
  debounceSaveDraft,
  legacyNewDraftKeys
} from './prompt-draft.ts'

test('builds edit draft key from prompt id', () => {
  assert.equal(buildDraftKey('prompt-1'), 'edit:prompt-1')
})

test('builds fixed new draft key when prompt id is empty', () => {
  assert.equal(buildDraftKey(''), 'new')
})

test('creates a PromptDraft with default values', () => {
  const draft = createDraft('new:123', '', '标题', '代码', '标签', '内容')
  assert.equal(draft.key, 'new:123')
  assert.equal(draft.name, '标题')
  assert.equal(draft.splitRatio, 0.5)
  assert.equal(draft.mode, 'split')
  assert.ok(draft.updatedAt > 0)
})

test('debounce merges rapid saves into one call', async () => {
  const saved: Array<{ content: string }> = []
  const debounced = debounceSaveDraft((draft) => saved.push({ content: draft.content }), 100)

  const base = createDraft('k', '', '', '', '', '')

  debounced({ ...base, content: 'A' })
  debounced({ ...base, content: 'B' })
  debounced({ ...base, content: 'C' })

  await new Promise((resolve) => setTimeout(resolve, 3500))

  assert.equal(saved.length, 1)
  assert.equal(saved[0].content, 'C')
})

test('legacyNewDraftKeys flags old timestamped new keys but not the fixed one', () => {
  const drafts = {
    new: createDraft('new', '', 'a', '', '', 'x'),
    'new:1700000000000': createDraft('new:1700000000000', '', 'b', '', '', 'y'),
    'new:1700000000001': createDraft('new:1700000000001', '', 'c', '', '', 'z'),
    'edit:prompt-1': createDraft('edit:prompt-1', 'prompt-1', 'd', '', '', 'w')
  }
  assert.deepEqual(legacyNewDraftKeys(drafts).sort(), ['new:1700000000000', 'new:1700000000001'])
})
