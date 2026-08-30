import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBranchButtonPosition } from './branch-position.ts'

const base = {
  anchor: { left: 400, right: 420, top: 300, bottom: 320 },
  buttonWidth: 90,
  buttonHeight: 34,
  viewportWidth: 1000,
  viewportHeight: 800
}

test('places a forward-selection button after and below the focus point', () => {
  assert.deepEqual(calculateBranchButtonPosition({ ...base, backward: false }), {
    left: 430,
    top: 330
  })
})

test('places a backward-selection button before and above the focus point', () => {
  assert.deepEqual(calculateBranchButtonPosition({ ...base, backward: true }), {
    left: 300,
    top: 256
  })
})

test('flips the button inward near the viewport edge', () => {
  assert.deepEqual(
    calculateBranchButtonPosition({
      ...base,
      anchor: { left: 950, right: 970, top: 750, bottom: 770 },
      backward: false
    }),
    {
      left: 850,
      top: 706
    }
  )
})
