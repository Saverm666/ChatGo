import assert from 'node:assert/strict'
import test from 'node:test'
import { handleBranchDiagnostic } from './branch-diagnostics.ts'

test('diagnostics serialize concurrent tab writes, bound records, strip extra fields and stop recording', async () => {
  let stored: Record<string, unknown> = {}
  const previous = globalThis.chrome
  Object.assign(globalThis, { chrome: { storage: { session: {
    get: async () => structuredClone(stored),
    set: async (value: Record<string, unknown>) => { stored = structuredClone(value) }
  } } } })
  try {
    const event = { id: 'trace', stage: 'api.fetch-start', at: 100, token: 'must-not-be-stored' }
    await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'event', event }, 1)
    assert.equal((await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'report' })).events.length, 0)
    await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'start' })
    await Promise.all(Array.from({ length: 310 }, (_, i) =>
      handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'event', event: { ...event, at: i } }, i % 2)))
    const state = await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'report' })
    assert.equal(state.events.length, 300)
    assert.equal(state.events[0].at, 10)
    assert.equal(state.events.at(-1)?.at, 309)
    assert.equal(JSON.stringify(state).includes('must-not-be-stored'), false)
    await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'stop' })
    const stopped = await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'event', event }, 1)
    assert.equal(stopped.enabled, false)
    assert.equal(stopped.events.length, 300)
    const reset = await handleBranchDiagnostic({ type: 'BRANCH_DIAGNOSTIC', action: 'start' })
    assert.equal(reset.events.length, 0)
  } finally { Object.assign(globalThis, { chrome: previous }) }
})
