import assert from 'node:assert/strict'
import test from 'node:test'

import { extractInlineKatexSources, renderPromptMarkdown } from './markdown.ts'

test('renders plain markdown headings and lists', () => {
  const result = renderPromptMarkdown('# 标题\n\n- item 1\n- item 2\n')
  assert.equal(result.unclosedFormula, false)
  assert.ok(result.html.includes('<h1>'))
  assert.ok(result.html.includes('<li>item 1</li>'))
})

test('renders inline and display katex formulas', () => {
  const result = renderPromptMarkdown('爱因斯坦 $E = mc^2$ 公式。\n\n$$\\int_0^1 x^2 dx$$\n')
  assert.equal(result.unclosedFormula, false)
  assert.ok(result.html.includes('katex'), `expected KaTeX output, got ${result.html}`)
  assert.ok(!result.html.includes('@@CHATGO_KATEX_'))
})

test('flags unclosed formula with odd trailing $', () => {
  const result = renderPromptMarkdown('片段 $x^2 还有一半')
  assert.equal(result.unclosedFormula, true)
})

test('sanitizes dangerous script tags when DOMPurify is available', () => {
  const result = renderPromptMarkdown('hello\n\n<script>alert(1)</script>\n\nplain')
  // 在浏览器环境 DOMPurify 会清洗；在 Node 环境跳过清洗但至少不崩溃
  assert.ok(!result.html.includes('<script>') || result.html.includes('&lt;script&gt;'))
})

test('returns empty html for empty source', () => {
  const result = renderPromptMarkdown('')
  assert.equal(result.html, '')
  assert.equal(result.unclosedFormula, false)
})

test('extracts katex sources from text', () => {
  const sources = extractInlineKatexSources('inline $a+b$ block $$\\sum_{i=1}^n i$$ end')
  assert.deepEqual(sources, ['a+b', '\\sum_{i=1}^n i'])
})
