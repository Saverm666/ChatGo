import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGeminiBranchRequest, geminiBranchUrlFromResponse } from './gemini-branch-api.ts'

const page = 'https://gemini.google.com/u/1/app/source?hl=zh'
const source = { conversationId: 'c_source', turnId: 'r_selected' }
const frame = (id: string, rpc = 'KDNZr') => JSON.stringify([['wrb.fr', rpc, JSON.stringify([[id, 'Title']]), null]])

test('builds the captured BranchConversation RPC with the selected turn and current account', () => {
  const request = buildGeminiBranchRequest(source, page, { SNlM0e: 'test-token', cfb2h: 'test-build', FdrFJe: 'test-session' })
  const url = new URL(request.url)
  assert.equal(url.origin, 'https://gemini.google.com')
  assert.equal(url.pathname, '/_/BardChatUi/data/batchexecute')
  assert.equal(url.searchParams.get('rpcids'), 'KDNZr')
  assert.equal(url.searchParams.get('authuser'), '1')
  assert.equal(url.searchParams.get('source-path'), '/u/1/app/source')
  const batch = JSON.parse(request.body.get('f.req')!)
  assert.deepEqual(JSON.parse(batch[0][0][1]), ['c_source', 'r_selected'])
  assert.equal(request.body.get('at'), 'test-token')
})

test('refuses wrong source IDs, absent credentials and foreign RPC origins', () => {
  assert.throws(() => buildGeminiBranchRequest({ ...source, conversationId: 'c_other' }, page, { SNlM0e: 'test-token' }))
  assert.throws(() => buildGeminiBranchRequest(source, page, {}))
  assert.throws(() => buildGeminiBranchRequest(source, page, { SNlM0e: 'test-token', eptZe: 'https://example.com/' }))
})

test('decodes XSSI/length-prefixed frames and preserves the account in the new URL', () => {
  const text = frame('c_new')
  assert.equal(geminiBranchUrlFromResponse(")]}'\n\n" + text.length + '\n' + text + '\n', page),
    'https://gemini.google.com/u/1/app/new')
  assert.equal(geminiBranchUrlFromResponse(frame('c_other', 'unrelated') + '\n' + text, page),
    'https://gemini.google.com/u/1/app/new')
})

test('never guesses a branch URL from source IDs, errors, or unrelated RPC results', () => {
  for (const text of [frame('c_source'), frame('c_new', 'unrelated'), frame('https://example.com'),
    JSON.stringify([['er', 'KDNZr', 403, 'c_new']]), '<html>login required</html>']) {
    assert.throws(() => geminiBranchUrlFromResponse(text, page))
  }
})
