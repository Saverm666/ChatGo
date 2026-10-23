import { createGeminiBranch, type GeminiPageConfig } from './modules/gemini-branch-api'

// MAIN world reads credentials locally; only the new URL crosses worlds.
// No router/store action is dispatched, so the source conversation stays open.
const pending = new Map<string, AbortController>()
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return
  const request = event.data
  if (request?.source !== 'chatgo-content' || typeof request.id !== 'string') return
  if (request.type === 'chatgo:cancel-gemini-branch') { pending.get(request.id)?.abort(); return }
  if (request.type !== 'chatgo:create-gemini-branch' || pending.has(request.id) ||
      typeof request.pageUrl !== 'string' || request.pageUrl !== location.href ||
      typeof request.conversationId !== 'string' || typeof request.turnId !== 'string' ||
      !Number.isFinite(request.expiresAt)) return
  const controller = new AbortController()
  const budget = Math.max(0, Math.min(10000, request.expiresAt - Date.now()))
  if (!budget) return
  pending.set(request.id, controller)
  const timer = setTimeout(() => controller.abort(), budget)
  const config = (window as unknown as { WIZ_global_data?: GeminiPageConfig }).WIZ_global_data ?? {}
  const phases: { stage: string; at: number }[] = []
  const mark = request.diagnostic === true ? (stage: string) => phases.push({ stage, at: performance.timeOrigin + performance.now() }) : undefined
  mark?.('api.bridge-received')
  void createGeminiBranch(request, request.pageUrl, config, controller.signal, mark).then((url) => {
    window.postMessage({ source: 'chatgo-page', type: 'chatgo:create-gemini-branch-result', id: request.id, url, phases }, location.origin)
  }).catch((error) => {
    const reason = controller.signal.aborted ? 'Gemini 分支请求已取消或超时。' :
      error instanceof Error ? error.message : 'Gemini 分支请求失败。'
    mark?.(controller.signal.aborted ? 'api.cancelled-or-timeout' : 'api.failed')
    window.postMessage({ source: 'chatgo-page', type: 'chatgo:create-gemini-branch-result', id: request.id, error: reason, phases }, location.origin)
  }).finally(() => { clearTimeout(timer); pending.delete(request.id) })
})
