import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRawHtmlBlockLines } from './raw-html-block.ts'

test('split <details> and <summary> onto separate lines', () => {
  assert.strictEqual(
    normalizeRawHtmlBlockLines('<details> <summary>点击展开</summary>'),
    '<details>\n<summary>点击展开</summary>'
  )
})

test('split <details> with no space before next tag', () => {
  assert.strictEqual(
    normalizeRawHtmlBlockLines('<details><summary>text</summary>'),
    '<details>\n<summary>text</summary>'
  )
})

test('split </details> onto its own line when trailing content', () => {
  assert.strictEqual(
    normalizeRawHtmlBlockLines('some content </details>'),
    'some content\n</details>'
  )
})

test('lone <details> or </details> unchanged', () => {
  assert.strictEqual(normalizeRawHtmlBlockLines('<details>'), '<details>')
  assert.strictEqual(normalizeRawHtmlBlockLines('</details>'), '</details>')
})

test('multi-line block: details+summary+content+close', () => {
  const input = '<details> <summary>点击展开</summary>\n\n内容\n\n</details>'
  const expected = '<details>\n<summary>点击展开</summary>\n\n内容\n\n</details>'
  assert.strictEqual(normalizeRawHtmlBlockLines(input), expected)
})

test('code block content is not touched', () => {
  const input = '```html\n<details> <summary>keep merged</summary>\n```\n<details> <summary>split me</summary>'
  const result = normalizeRawHtmlBlockLines(input)
  assert.ok(result.includes('<details> <summary>keep merged</summary>'))
  assert.ok(result.includes('<details>\n<summary>split me</summary>'))
})

test('indented code block (4-space) is not touched', () => {
  const input = '    <details> <summary>keep</summary>\n\n<details> <summary>split</summary>'
  const result = normalizeRawHtmlBlockLines(input)
  assert.ok(result.includes('    <details> <summary>keep</summary>'))
  assert.ok(result.includes('<details>\n<summary>split</summary>'))
})
