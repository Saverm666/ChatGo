import { sendRuntimeMessage } from '@/main/messaging'

interface DiagnosticState { enabled: boolean; startedAt: number; events: unknown[] }
let active = false
let ready = Promise.resolve()
const evaluatedAt = performance.timeOrigin + performance.now()
const pageId = `page:${performance.timeOrigin}`

export function markBranchDiagnostic(id: string | undefined, stage: string, duration?: number, at = performance.timeOrigin + performance.now()): void {
  if (!id) return
  void ready.then(() => {
    if (active) void sendRuntimeMessage({ type: 'BRANCH_DIAGNOSTIC', action: 'event', event: { id, stage, at, duration } })
  })
}

export async function beginBranchDiagnostic(): Promise<string | undefined> {
  await ready
  if (!active) return undefined
  const id = crypto.randomUUID()
  markBranchDiagnostic(id, 'source.branch-start')
  return id
}

export function markBranchStartup(stage: string): void {
  const at = performance.timeOrigin + performance.now()
  void ready.then(() => markBranchDiagnostic(pageId, stage, undefined, at))
}

export function initializeBranchDiagnostics(): void {
  if (location.hostname !== 'gemini.google.com') return
  ready = sendRuntimeMessage<DiagnosticState>({ type: 'BRANCH_DIAGNOSTIC', action: 'report' }).then(result => {
    active = result.ok && result.data?.enabled === true
    markBranchDiagnostic(pageId, 'page.content-evaluated', undefined, evaluatedAt)
  })
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin ||
        event.data?.source !== 'chatgo-diagnostic-console' || typeof event.data.id !== 'string' ||
        !['start', 'stop', 'report'].includes(event.data.action)) return
    const { id, action } = event.data
    void sendRuntimeMessage<DiagnosticState>({ type: 'BRANCH_DIAGNOSTIC', action }).then(result => {
      if (result.ok && result.data) active = result.data.enabled
      window.postMessage({ source: 'chatgo-diagnostic-extension', id, result }, location.origin)
    })
  })
}
