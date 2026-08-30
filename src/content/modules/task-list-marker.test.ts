import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTaskListCheckboxMarker } from './task-list-marker.ts'

test('formatTaskListCheckboxMarker - checked states', () => {
  assert.strictEqual(
    formatTaskListCheckboxMarker({ checked: true, followingStartsWithSpace: true }),
    '[x]'
  )
  assert.strictEqual(
    formatTaskListCheckboxMarker({ checked: false, followingStartsWithSpace: true }),
    '[ ]'
  )
})

test('formatTaskListCheckboxMarker - trailing space only when no following space', () => {
  assert.strictEqual(
    formatTaskListCheckboxMarker({ checked: true, followingStartsWithSpace: false }),
    '[x] '
  )
  assert.strictEqual(
    formatTaskListCheckboxMarker({ checked: false, followingStartsWithSpace: false }),
    '[ ] '
  )
})
