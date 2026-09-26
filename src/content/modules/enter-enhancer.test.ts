import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTextareaLineBreak, isStopGeneratingLabel } from './enter-enhancer.ts'

test('在选区处插入换行并移动光标', () => {
  const result = applyTextareaLineBreak('hello world', 5, 5)
  assert.equal(result.value, 'hello\n world')
  assert.equal(result.caret, 6)
})

test('替换选区后插入换行', () => {
  const result = applyTextareaLineBreak('hello world', 0, 5)
  assert.equal(result.value, '\n world')
  assert.equal(result.caret, 1)
})

test('光标位置越界时收敛到文本长度', () => {
  const result = applyTextareaLineBreak('abc', 99, 120)
  assert.equal(result.value, 'abc\n')
  assert.equal(result.caret, 4)
})

test('空输入框插入换行', () => {
  const result = applyTextareaLineBreak('', 0, 0)
  assert.equal(result.value, '\n')
  assert.equal(result.caret, 1)
})

test('噪声位置（倒置选区）不会破坏文本', () => {
  const result = applyTextareaLineBreak('abcdef', 4, 1)
  assert.equal(result.value, 'abcd\nef')
  assert.equal(result.caret, 5)
})

test('识别“停止生成”标签，避免 Ctrl+Enter 误触中断', () => {
  assert.equal(isStopGeneratingLabel('Stop streaming'), true)
  assert.equal(isStopGeneratingLabel('停止生成'), true)
  assert.equal(isStopGeneratingLabel('  Stop  '), true)
  assert.equal(isStopGeneratingLabel('Send message'), false)
  assert.equal(isStopGeneratingLabel('发送消息'), false)
  assert.equal(isStopGeneratingLabel(''), false)
  assert.equal(isStopGeneratingLabel(null), false)
  assert.equal(isStopGeneratingLabel(undefined), false)
})
