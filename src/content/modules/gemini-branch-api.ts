// Protocol verified against BardChatUi's BranchConversation on 2026-10-09:
// request fields 1/2 are conversationId/turnId; response field 1 contains
// conversation metadata, whose first field is the new conversation ID.
export const GEMINI_BRANCH_RPC = 'KDNZr'
export interface GeminiBranchSource { conversationId: string; turnId: string }
export interface GeminiPageConfig { SNlM0e?: unknown; cfb2h?: unknown; FdrFJe?: unknown; eptZe?: unknown }

export function buildGeminiBranchRequest(source: GeminiBranchSource, pageUrl: string, config: GeminiPageConfig) {
  const page = new URL(pageUrl)
  const route = page.pathname.match(/^(\/u\/(\d+))?\/app\/([\w-]+)\/?$/)
  if (page.origin !== 'https://gemini.google.com' || !route ||
      source.conversationId !== `c_${route[3]}` || !/^r_[\w-]+$/.test(source.turnId)) {
    throw new Error('Gemini 分支来源与当前会话不匹配。')
  }
  if (typeof config.SNlM0e !== 'string' || !config.SNlM0e) throw new Error('未找到 Gemini 登录凭据，请刷新已登录的会话页。')
  const prefix = typeof config.eptZe === 'string' ? config.eptZe : '/_/BardChatUi/'
  const url = new URL(`${prefix.replace(/\/?$/, '/')}data/batchexecute`, page.origin)
  if (url.origin !== page.origin || !url.pathname.endsWith('/data/batchexecute')) throw new Error('Gemini RPC 地址无效。')
  url.searchParams.set('rpcids', GEMINI_BRANCH_RPC)
  url.searchParams.set('source-path', page.pathname)
  url.searchParams.set('rt', 'c')
  if (route[2]) url.searchParams.set('authuser', route[2])
  if (typeof config.cfb2h === 'string' && config.cfb2h) url.searchParams.set('bl', config.cfb2h)
  if (typeof config.FdrFJe === 'string' && config.FdrFJe) url.searchParams.set('f.sid', config.FdrFJe)
  const body = new URLSearchParams({
    'f.req': JSON.stringify([[[GEMINI_BRANCH_RPC, JSON.stringify([source.conversationId, source.turnId]), null, 'generic']]]),
    at: config.SNlM0e
  })
  return { url: url.href, body }
}

export function geminiBranchUrlFromResponse(text: string, pageUrl: string): string {
  // XSSI prefix + length-prefixed single-line JSON frames. Inspect only our
  // RPC's response, never an unrelated c_* string in another result or error.
  for (const line of text.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('[')) continue
    let frame: unknown
    try { frame = JSON.parse(line) } catch { continue }
    if (!Array.isArray(frame)) continue
    for (const row of frame) {
      if (!Array.isArray(row) || row[0] !== 'wrb.fr' || row[1] !== GEMINI_BRANCH_RPC || typeof row[2] !== 'string') continue
      let payload: unknown
      try { payload = JSON.parse(row[2]) } catch { continue }
      const metadata = Array.isArray(payload) ? payload[0] : null
      const id = Array.isArray(metadata) ? metadata[0] : null
      if (typeof id !== 'string' || !/^c_[\w-]+$/.test(id)) continue
      const page = new URL(pageUrl)
      const source = page.pathname.match(/^(\/u\/\d+)?\/app\/([\w-]+)\/?$/)
      if (page.origin !== 'https://gemini.google.com' || !source || id === `c_${source[2]}`) break
      return `${page.origin}${source[1] ?? ''}/app/${id.slice(2)}`
    }
  }
  throw new Error('Gemini 未返回有效的新分支会话，原页面已保留。')
}

export async function createGeminiBranch(source: GeminiBranchSource, pageUrl: string, config: GeminiPageConfig, signal?: AbortSignal, mark?: (stage: string) => void): Promise<string> {
  mark?.('api.request-build-start')
  const request = buildGeminiBranchRequest(source, pageUrl, config)
  mark?.('api.fetch-start')
  const response = await fetch(request.url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: request.body, signal
  })
  mark?.('api.headers-received')
  if (!response.ok) throw new Error(`Gemini 分支接口请求失败（HTTP ${response.status}）。`)
  const body = await response.text()
  mark?.('api.body-received')
  const url = geminiBranchUrlFromResponse(body, pageUrl)
  mark?.('api.response-parsed')
  return url
}
