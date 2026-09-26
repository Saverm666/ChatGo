import assert from 'node:assert/strict'
import test from 'node:test'
import { listSelectorAlternatives, USER_CLICK_EVENT_SEQUENCE, waitForValue } from './utils.ts'

test('按书写顺序拆分选择器列表', () => {
  assert.deepEqual(listSelectorAlternatives('a, b ,c'), ['a', 'b', 'c'])
})

test('保留括号/引号内的逗号', () => {
  const selector = 'div:not([data-x="a,b"] *), #prompt-textarea'
  assert.deepEqual(listSelectorAlternatives(selector), [
    'div:not([data-x="a,b"] *)',
    '#prompt-textarea'
  ])
})

test('保留 :is(...) 里的逗号', () => {
  assert.deepEqual(listSelectorAlternatives('div:is(.a,.b), span'), ['div:is(.a,.b)', 'span'])
})

test('空输入与空片段被丢弃', () => {
  assert.deepEqual(listSelectorAlternatives(''), [])
  assert.deepEqual(listSelectorAlternatives(null), [])
  assert.deepEqual(listSelectorAlternatives('a, ,b,'), ['a', 'b'])
})

// 回归：只监听 pointerdown 的组件（如 Radix 菜单触发器）对纯 click 无反应，
// 所以点击序列必须包含 pointerdown。
test('点击序列包含 pointerdown 且顺序正确', () => {
  const types = USER_CLICK_EVENT_SEQUENCE.map((step) => step.type)
  assert.ok(types.includes('pointerdown'), '缺少 pointerdown，只监听 pointerdown 的菜单不会打开')
  assert.ok(types.indexOf('pointerdown') < types.indexOf('pointerup'))
  assert.ok(types.indexOf('pointerdown') < types.indexOf('click'))
  assert.equal(types.at(-1), 'click', 'click 必须是最后一个事件')
  assert.deepEqual(types.slice(0, 3), ['pointerover', 'pointerenter', 'pointermove'])
})

test('只有 pointerdown/mousedown 处于按下态', () => {
  const pressed = USER_CLICK_EVENT_SEQUENCE.filter((step) => step.buttons === 1).map((s) => s.type)
  assert.deepEqual(pressed, ['pointerdown', 'mousedown'])
  assert.ok(USER_CLICK_EVENT_SEQUENCE.every((step) => step.pointer === step.type.startsWith('pointer')))
})

test('cancelled waits stop polling and do not consume a late value', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  let calls = 0
  const controller = new AbortController()
  const pending = waitForValue(() => { calls++; return null }, { intervalMs: 5, signal: controller.signal })
  controller.abort()
  assert.equal(await pending, null)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(calls, 1)
  assert.equal(await waitForValue(() => { calls++; return 'late' }, { signal: controller.signal }), null)
  assert.equal(calls, 1)
  assert.equal(await waitForValue(() => 'ready'), 'ready')
})
