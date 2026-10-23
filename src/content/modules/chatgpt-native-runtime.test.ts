import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addNativeAttachment, attachmentApiFromRuntime, conversationIdFromUrl,
  findComposerScope, runtimeUrlFromSource,
  hasReactAncestorKey,
  inspectAttachmentRuntime,
  type NativeAttachment, type NativeScope
} from './chatgpt-native-runtime.ts'

test('uses the runtime imported by the active page, rejecting other origins', () => {
  const entry = 'https://chatgpt.com/cdn/assets/538990.5a.js'
  assert.equal(runtimeUrlFromSource('import{__webpack_require__ as e}from"./633146.hash.js";', entry),
    'https://chatgpt.com/cdn/assets/633146.hash.js')
  assert.equal(runtimeUrlFromSource('import{__webpack_require__ as e}from"https://example.com/code.js";', entry), null)
  assert.equal(runtimeUrlFromSource('export const __webpack_modules__={}', entry), null)
  assert.equal(runtimeUrlFromSource('import{other as o,__webpack_require__ as $r,third}from"./runtime.js";', entry),
    'https://chatgpt.com/cdn/assets/runtime.js')
  assert.equal(runtimeUrlFromSource('import{__webpack_require__}from"./runtime.js";', entry),
    'https://chatgpt.com/cdn/assets/runtime.js')
  assert.equal(runtimeUrlFromSource('export{r as __webpack_require__};', entry), entry)
  assert.equal(runtimeUrlFromSource('import{__webpack_require__ as r}from"https://example.com/no.js";import{__webpack_require__ as s}from"./runtime.js";', entry),
    'https://chatgpt.com/cdn/assets/runtime.js')
  assert.equal(runtimeUrlFromSource('import{__webpack_require__ as r}from"/cdn/assets/../not-an-asset.js";', entry), null)
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

// The captured module's export getters and add function, with dependencies
// replaced by inert values. Renumber every private identifier for a second build.
function attachmentExports(renamed = false): Record<string, unknown> {
  let source = `
    let ea="chatgpt-global",ey={},ep={},V={a:{},b(){}},m={a:()=>"new-attachment"};
    function eP(e,t,n,r){let a=n.trim();0!==a.length&&(e.get(V.a,t)?.widgetContextId!=null&&(0,V.b)(e,t,null),e.set(ey,t,e=>[...e,{id:(0,m.a)(),text:null==r?a:n,source:r}]))}
    return Object.defineProperties({}, {
      a:{get:()=>ea},b:{get:()=>eP},v:{get:()=>ey},other:{get:()=>ep}
    });
  `
  if (renamed) {
    const names: Record<string, string> = { ea: '$global', ey: '$list', ep: '$other', eP: '$add', e: '$scope', t: '$key', n: '$text' }
    source = source.replace(/\b(ea|ey|ep|eP|e|t|n)\b/g, (name) => names[name])
      .replace('a:{get:', 'z:{get:').replace('b:{get:', 'x:{get:').replace('v:{get:', 'q:{get:')
  }
  return new Function(source)() as Record<string, unknown>
}

// Exact add-function body from 7078.cf78310c7b.js, module Ow, 2026-10-09.
// This build removed widgetContextId handling and added optional source metadata.
function currentAttachmentExports(): Record<string, unknown> {
  return new Function(`
    const ed="chatgpt-global",ex={},g={a:()=>"new-attachment"};
    function ez(e,t,n,a,r,i){let o=n.trim();0!==o.length&&e.set(ex,t,e=>[...e,{id:(0,g.a)(),text:null==a?o:n,source:a,sourceMessageId:r,sourceOccurrence:i}])}
    return Object.defineProperties({}, {a:{get:()=>ed},b:{get:()=>ez},v:{get:()=>ex}});
  `)() as Record<string, unknown>
}

test('accepts the current online add function without the removed widgetContextId check', () => {
  const exports = currentAttachmentExports()
  const runtime = { __webpack_require__: { c: { Ow: { exports } } } }
  const { api, report } = inspectAttachmentRuntime(runtime)
  assert.ok(api)
  assert.equal(api.add, exports.b)
  assert.equal(api.list, exports.v)
  assert.equal(report.candidates[0].rejection, null)
  assert.equal(report.candidates[0].moduleId, 'Ow')
  assert.ok(!report.candidates[0].source.includes('widgetContextId'))
  // One unrelated getter in its temporal dead zone must not hide the API.
  Object.defineProperty(exports, 'pending', { get() { throw new ReferenceError('pending') } })
  assert.ok(attachmentApiFromRuntime(runtime))
})

test('reports an exact binding mismatch without invoking a candidate', () => {
  const exports = currentAttachmentExports()
  const { api, report } = inspectAttachmentRuntime({ __webpack_require__: { c: { Ow: {
    exports: { a: exports.a, b: exports.b, v: exports.v }
  } } } })
  assert.equal(api, null)
  assert.equal(report.candidates[0].rejection, 'list-binding')
  assert.equal(report.cacheAvailable, true)
})

test('resolves both the captured build and renamed exports without invoking the add function', () => {
  for (const renamed of [false, true]) {
    const exports = attachmentExports(renamed)
    const api = attachmentApiFromRuntime({ __webpack_require__: { c: { 'new-module-id': { exports } } } })
    assert.ok(api)
    assert.equal(api.add, exports[renamed ? 'x' : 'b'])
    assert.equal(api.list, exports[renamed ? 'q' : 'v'])
    assert.notEqual(api.list, exports.other)
    let entries: NativeAttachment[] = []
    const scope: NativeScope = {
      scope: { __scopeBrand: 'AppScope' },
      get(binding) { return binding === api.list ? entries : null },
      set(binding, key, update) {
        assert.equal(binding, api.list)
        assert.equal(key, 'conversation')
        entries = update(entries)
      }
    }
    const rollback = addNativeAttachment(api, scope, 'conversation', '  **quote**  ')
    assert.ok(rollback)
    assert.equal(entries[0].text, '**quote**')
    rollback()
    assert.deepEqual(entries, [])
  }
})

test('skips uninitialized modules and refuses multiple distinct attachment APIs', () => {
  const exports = attachmentExports(true)
  const broken = Object.defineProperty({}, 'pending', { get() { throw new ReferenceError('uninitialized') } })
  const cache = {
    broken: { exports: broken },
    staleId: { exports: { a: 'unrelated', b() {} } },
    current: { exports }
  }
  assert.ok(attachmentApiFromRuntime({ __webpack_require__: { c: cache } }))
  assert.ok(attachmentApiFromRuntime({ __webpack_require__: { c: { ...cache, reexport: { exports } } } }))
  assert.equal(attachmentApiFromRuntime({ __webpack_require__: { c: {
    ...cache, ambiguous: { exports: attachmentExports() }
  } } }), null)
})

test('refuses to guess the binding from multiple array stores or a missing module marker', () => {
  const exports = attachmentExports()
  assert.equal(attachmentApiFromRuntime({ __webpack_require__: { c: { current: { exports: {
    a: exports.a, b: exports.b, v: exports.v, other: exports.other
  } } } } }), null)
  assert.equal(attachmentApiFromRuntime({ __webpack_require__: { c: { current: { exports:
    Object.defineProperties({}, { b: { get: () => exports.b }, v: { get: () => exports.v } })
  } } } }), null)
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
