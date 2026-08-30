import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTableSeparatorCell,
  buildTableSeparatorRow
} from './table-separator.ts'

test('formatTableSeparatorCell - alignment variants', () => {
  assert.strictEqual(formatTableSeparatorCell('left'), ':---')
  assert.strictEqual(formatTableSeparatorCell('center'), ':---:')
  assert.strictEqual(formatTableSeparatorCell('right'), '---:')
  assert.strictEqual(formatTableSeparatorCell(null), '---')
})

test('buildTableSeparatorRow - full alignment row', () => {
  assert.strictEqual(
    buildTableSeparatorRow(['left', 'center', 'right']),
    '| :--- | :---: | ---: |'
  )
})

test('buildTableSeparatorRow - default (no alignment) stays --- ', () => {
  assert.strictEqual(
    buildTableSeparatorRow([null, null, null]),
    '| --- | --- | --- |'
  )
})

test('buildTableSeparatorRow - mixed explicit/default', () => {
  assert.strictEqual(
    buildTableSeparatorRow([null, null, 'right', null, null]),
    '| --- | --- | ---: | --- | --- |'
  )
})
