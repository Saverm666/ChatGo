import test from 'node:test'
import assert from 'node:assert/strict'
import { formatBranchQuotedMarkdown } from './branch-quote.ts'

test('quotes every Markdown line without changing its inline syntax', () => {
  assert.equal(
    formatBranchQuotedMarkdown('**标题**\n- 项目\n$E = mc^2$'),
    '> **标题**\n> - 项目\n> $E = mc^2$\n\n'
  )
})

test('keeps blank lines inside the quoted Markdown block', () => {
  assert.equal(formatBranchQuotedMarkdown('第一段\n\n第二段'), '> 第一段\n>\n> 第二段\n\n')
})

test('returns empty text for an empty selection', () => {
  assert.equal(formatBranchQuotedMarkdown(' \n '), '')
})
