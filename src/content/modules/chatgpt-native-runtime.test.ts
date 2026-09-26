import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addNativeAttachment, attachmentApiFromRuntime, conversationIdFromUrl,
  findComposerScope, runtimeUrlFromSource,
  hasReactAncestorKey,
  type NativeAttachment, type NativeScope
} from './chatgpt-native-runtime.ts'

test('uses the runtime imported by the active page, rejecting other origins', () => {
  const entry = 'https://chatgpt.com/cdn/assets/538990.5a.js'
  assert.equal(runtimeUrlFromSource('import{__webpack_require__ as e}from"./633146.hash.js";', entry),
    'https://chatgpt.com/cdn/assets/633146.hash.js')
  assert.equal(runtimeUrlFromSource('import{__webpack_require__ as e}from"https://example.com/code.js";', entry), null)
  assert.equal(runtimeUrlFromSource('export const __webpack_modules__={}', entry), null)
})

test('decodes local branch IDs and refuses the intermediate branch route', () => {
  assert.equal(conversationIdFromUrl('https://chatgpt.com/c/local-chatgpt%3Aabc'), 'local-chatgpt:abc')
  assert.equal(conversationIdFromUrl('https://chatgpt.com/g/g-example/c/abc'), 'abc')
  assert.equal(conversationIdFromUrl('https://chatgpt.com/branch/source/message'), null)
  assert.equal(conversationIdFromUrl('https://chatgpt.com/c/%xx'), null)
})

test('finds an existing AppScope reference on a composer ancestor without invoking hooks', () => {
  const scope = { scope: { __scopeBrand: 'AppScope' }, get() {}, set() {} }
  const parent = { memoizedState: { memoizedState: { current: scope } } }
  assert.equal(findComposerScope({ __reactFiber$test: { return: parent } }), scope)
  assert.equal(findComposerScope({ __reactFiber$test: { memoizedState: { memoizedState: { current: {} } } } }), null)
  assert.equal(findComposerScope({}), null)
})

test('caps traversal for unexpected or cyclic fiber data', () => {
  const fiber: { return?: unknown } = {}
  fiber.return = fiber
  assert.equal(findComposerScope({ __reactFiber$test: fiber }), null)
})

test('refuses incompatible runtime exports rather than invoking an unrelated function', () => {
  let called = false
  assert.equal(attachmentApiFromRuntime({ __webpack_require__: { c: { vG: { exports: {
    a: 'chatgpt-global', b() { called = true }, v: {}
  } } } } }), null)
  assert.equal(called, false)
  assert.equal(attachmentApiFromRuntime(null), null)
})

test('native attachment preserves markdown and rollback keeps concurrent user attachments', () => {
  const markdown = '**标题**\n\n```ts\nconst n = 1\n```'
  let attachments: NativeAttachment[] = [{ id: 'existing', text: 'existing' }]
  const scope: NativeScope = {
    scope: { __scopeBrand: 'AppScope' },
    get: () => attachments,
    set: (_binding, _key, update) => { attachments = update(attachments) }
  }
  const api = {
    list: {},
    add(_scope: NativeScope, key: string, text: string) {
      assert.equal(key, 'local-chatgpt:abc')
      assert.equal(text, markdown)
      attachments = [...attachments, { id: 'native-quote', text }]
    }
  }
  const rollback = addNativeAttachment(api, scope, 'local-chatgpt:abc', markdown)
  assert.ok(rollback)
  assert.equal(rollback.id, 'native-quote')
  assert.equal(rollback.isPresent(), true)
  attachments.push({ id: 'user-added', text: 'during rendering' })
  rollback()
  assert.equal(rollback.isPresent(), false)
  assert.deepEqual(attachments.map((entry) => entry.id), ['existing', 'user-added'])
})

test('matches only the current attachment key and bounds cyclic preview fibers', () => {
  const fiber: { key: string; return?: unknown } = { key: 'attachment-current' }
  fiber.return = fiber
  const preview = { __reactFiber$test: { return: fiber } }
  assert.equal(hasReactAncestorKey(preview, 'attachment-current'), true)
  assert.equal(hasReactAncestorKey(preview, 'another-attachment'), false)
  assert.equal(hasReactAncestorKey({}, 'attachment-current'), false)
})

test('does not treat a preexisting matching quote as a successful add', () => {
  const scope: NativeScope = { scope: { __scopeBrand: 'AppScope' }, get: () => [{ id: 'old', text: 'quote' }], set() {} }
  assert.equal(addNativeAttachment({ list: {}, add() {} }, scope, 'chat', 'quote'), null)
})


test('finds AppScope above an imperative editor without its own React fiber', () => {
  const scope = { scope: { __scopeBrand: 'AppScope' }, get() {}, set() {} }
  const form = { __reactFiber$form: { return: {
    memoizedState: { memoizedState: { current: scope } }
  } } }
  const editor = { parentElement: { parentElement: form } }
  assert.equal(findComposerScope(editor), scope)
})

test('bounds DOM traversal and handles a detached editor', () => {
  const editor: { parentElement?: unknown } = {}
  editor.parentElement = editor
  assert.equal(findComposerScope(editor), null)
  assert.equal(findComposerScope({ parentElement: null }), null)
})
