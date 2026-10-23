import type { RuntimeMessage } from '../main/messaging'

const KEY = 'chatgoBranchDiagnostics'
interface DiagnosticEvent { id: string; stage: string; at: number; duration?: number; tabId?: number }
interface DiagnosticState { enabled: boolean; startedAt: number; events: DiagnosticEvent[] }
let queue = Promise.resolve()

// Serialize writes across source/target tabs; session storage survives worker
// suspension and clears when the browser session ends. Never store URLs/text/tokens.
export function handleBranchDiagnostic(message: Extract<RuntimeMessage, { type: 'BRANCH_DIAGNOSTIC' }>, tabId?: number): Promise<DiagnosticState> {
  const operation = queue.then(async () => {
    const stored = await chrome.storage.session.get(KEY)
    let state: DiagnosticState = stored[KEY] ?? { enabled: false, startedAt: 0, events: [] }
    if (message.action === 'start') state = { enabled: true, startedAt: Date.now(), events: [] }
    if (message.action === 'stop') state.enabled = false
    const event = message.event
    if (message.action === 'event' && state.enabled && event &&
        typeof event.id === 'string' && event.id.length <= 100 &&
        typeof event.stage === 'string' && event.stage.length <= 80 && Number.isFinite(event.at) &&
        (event.duration === undefined || (Number.isFinite(event.duration) && event.duration >= 0))) {
      state.events.push({ id: event.id, stage: event.stage, at: event.at, duration: event.duration, tabId })
      state.events = state.events.slice(-300)
    }
    if (message.action !== 'report') await chrome.storage.session.set({ [KEY]: state })
    return state
  })
  queue = operation.then(() => undefined, () => undefined)
  return operation
}
