import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverAttachmentApi } from './chatgpt-native-loader.ts'
import type { NativeScope } from './chatgpt-native-runtime.ts'

test('rescans a retained runtime after resource entries disappear and the composer module loads', async () => {
  const cache: Record<string, { exports: unknown }> = {}
  const url = 'https://chatgpt.com/cdn/assets/runtime.js'
  const known = new Map([[url, { __webpack_require__: { c: cache } }]])
  const noImport = async () => { throw new Error('must use the retained runtime') }
  const before = await discoverAttachmentApi([], Date.now() + 1000, noImport, known)
  assert.equal(before.api, null)
  assert.equal(before.report.stage, 'api')
  assert.deepEqual(before.report.runtimes, [url])
  assert.equal(before.report.runtimeReports[url].moduleCount, 0)

  const list = {}
  function add(scope: NativeScope, key: string, text: string) {
    const trimmed = text.trim()
    scope.set(list, key, (entries) => [...entries, { id: 'quote', text: trimmed, source: undefined }])
  }
  cache.current = { exports: Object.defineProperties({}, {
    global: { value: 'chatgpt-global' }, add: { value: add }, binding: { get: () => list }
  }) }
  const after = await discoverAttachmentApi([], Date.now() + 1000, noImport, known)
  assert.ok(after.api)
  assert.equal(after.api.add, add)
  assert.equal(after.api.list, list)
  assert.equal(after.report.stage, 'ready')
  assert.equal(after.report.fetched, 0)
})
