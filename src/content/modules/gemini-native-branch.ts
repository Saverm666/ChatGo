import type { GeminiBranchSource } from './gemini-branch-api.ts'
import { markBranchDiagnostic } from './branch-diagnostics'

// Only types are shared with MAIN world, keeping its bridge standalone.
export function requestGeminiBranch(source: GeminiBranchSource, signal?: AbortSignal, diagnosticId?: string): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('Gemini 分支请求已取消。'))
  const pageUrl = location.href
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (url?: string, error?: string) => {
      clearTimeout(timer)
      window.removeEventListener('message', onResult)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(new Error(error))
      else if (url) resolve(url)
    }
    const cancel = () => window.postMessage({ source: 'chatgo-content', type: 'chatgo:cancel-gemini-branch', id }, location.origin)
    const onAbort = () => { cancel(); finish(undefined, 'Gemini 分支请求已取消。') }
    const onResult = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'chatgo-page' ||
          event.data.type !== 'chatgo:create-gemini-branch-result' || event.data.id !== id) return
      if (Array.isArray(event.data.phases)) {
        for (const phase of event.data.phases.slice(0, 12)) {
          if (typeof phase?.stage === 'string' && phase.stage.startsWith('api.') && Number.isFinite(phase.at))
            markBranchDiagnostic(diagnosticId, phase.stage, undefined, phase.at)
        }
      }
      markBranchDiagnostic(diagnosticId, 'source.bridge-result')
      if (signal?.aborted || location.href !== pageUrl) { finish(undefined, '来源页面已变化，未打开分支。'); return }
      if (typeof event.data.error === 'string') { finish(undefined, event.data.error); return }
      if (typeof event.data.url === 'string') finish(event.data.url)
    }
    const timer = setTimeout(() => {
      cancel(); finish(undefined, 'Gemini 分支接口响应超时，请确认扩展已重新加载并刷新页面。')
    }, 11000)
    window.addEventListener('message', onResult)
    signal?.addEventListener('abort', onAbort, { once: true })
    window.postMessage({ source: 'chatgo-content', type: 'chatgo:create-gemini-branch',
      id, ...source, pageUrl, diagnostic: Boolean(diagnosticId), expiresAt: Date.now() + 10000 }, location.origin)
  })
}
