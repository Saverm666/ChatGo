import assert from 'node:assert/strict'
import test from 'node:test'

import { getPanelPlacement, getPanelPosition, getResponsivePanelSize } from './floating-geometry.ts'

test('uses a fixed viewport-ratio panel height until it cannot fit', () => {
  assert.deepEqual(
    getResponsivePanelSize({ width: 900, height: 1000 }, 360, 0.7, 380, 560, 8),
    { width: 360, height: 560 }
  )
  assert.deepEqual(
    getResponsivePanelSize({ width: 900, height: 700 }, 360, 0.7, 380, 560, 8),
    { width: 360, height: 490 }
  )
  assert.deepEqual(
    getResponsivePanelSize({ width: 900, height: 360 }, 360, 0.7, 380, 560, 8),
    { width: 360, height: 344 }
  )
})

test('places the panel to the left of a button near the right edge with a fixed gap', () => {
  const placement = getPanelPlacement(
    { x: 740, y: 260 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    12
  )
  const position = getPanelPosition(
    { x: 740, y: 260 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    8,
    12,
    placement
  )

  assert.equal(placement.side, 'left')
  assert.equal(position.right, 800 - 740 + 12)
})

test('places the panel above a button near the bottom edge with a fixed gap', () => {
  const placement = getPanelPlacement(
    { x: 320, y: 540 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    12
  )
  const position = getPanelPosition(
    { x: 320, y: 540 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    8,
    12,
    placement
  )

  assert.equal(placement.side, 'above')
  assert.equal(position.bottom, 600 - 540 + 12)
})

test('prefers horizontal placement at a corner so one vertical edge stays near the button', () => {
  const placement = getPanelPlacement(
    { x: 740, y: 540 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    12
  )

  assert.equal(placement.side, 'left')
})

test('anchors a left-side panel to the button bottom near the bottom edge', () => {
  const placement = getPanelPlacement(
    { x: 740, y: 540 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    12
  )
  const position = getPanelPosition(
    { x: 740, y: 540 },
    { width: 800, height: 600 },
    { width: 360, height: 560 },
    52,
    8,
    12,
    placement
  )

  assert.equal(position.right, 72)
  assert.equal(position.bottom, 8)
})
