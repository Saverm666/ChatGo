// Adapter for the Rspack/Maitai ChatGPT composer.
// Resolve the existing runtime and AppScope; never instantiate another store.
export interface NativeScope {
  scope: { __scopeBrand: string }
  get(binding: unknown, key: string): unknown
  set(binding: unknown, key: string, update: (value: NativeAttachment[]) => NativeAttachment[]): void
}
export interface NativeAttachment { id: string; text: string }
interface Fiber {
  key?: string | null
  return?: Fiber
  memoizedState?: { memoizedState?: unknown; next?: Fiber['memoizedState'] }
  memoizedProps?: { conversationId?: unknown }
}

export function hasReactAncestorKey(element: object, key: string): boolean {
  const fiberKey = Object.keys(element).find((name) => name.startsWith('__reactFiber$'))
  let fiber = fiberKey ? (element as Record<string, unknown>)[fiberKey] as Fiber : undefined
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    if (fiber.key === key) return true
  }
  return false
}

export function findComposerScope(element: object): NativeScope | null {
  // ProseMirror creates the editable DOM imperatively, so that element does
  // not necessarily carry React's fiber. Start at its nearest React host.
  let host: object | null = element
  let fiber: Fiber | undefined
  for (let depth = 0; host && depth < 30; depth++) {
    const key = Object.keys(host).find((key) => key.startsWith('__reactFiber$'))
    if (key) {
      fiber = (host as Record<string, unknown>)[key] as Fiber
      if (fiber) break
    }
    host = (host as { parentElement?: object | null }).parentElement ?? null
  }
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    let hook = fiber.memoizedState
    for (let count = 0; hook && count < 200; count++, hook = hook.next) {
      const ref = hook.memoizedState as { current?: Partial<NativeScope> } | null
      const scope = ref?.current
      if (scope?.scope?.__scopeBrand === 'AppScope' &&
          typeof scope.get === 'function' && typeof scope.set === 'function') return scope as NativeScope
    }
  }
  return null
}

export function conversationIdFromUrl(url: string): string | null {
  const path = new URL(url).pathname
  const match = path.match(/(?:^|\/)c\/([^/]+)\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

export function runtimeUrlFromSource(source: string, url: string): string | null {
  const imports = source.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)
  for (const match of imports) {
    if (!match[1].split(',').some((entry) => /^\s*__webpack_require__(?:\s+as\s+[\w$]+)?\s*$/.test(entry))) continue
    const target = new URL(match[2], url)
    if (target.origin === 'https://chatgpt.com' && /^\/cdn\/assets\/[^/]+\.js$/.test(target.pathname)) return target.href
  }
  // Some pages list the runtime itself rather than a script importing it.
  if (/\bexport\s*\{[^}]*\bas\s+__webpack_require__\b/.test(source)) {
    const target = new URL(url)
    if (target.origin === 'https://chatgpt.com' && /^\/cdn\/assets\/[^/]+\.js$/.test(target.pathname)) return target.href
  }
  return null
}

export interface AttachmentApi {
  add(scope: NativeScope, conversationId: string, text: string): void
  list: unknown
}

export interface AttachmentRuntimeReport {
  cacheAvailable: boolean
  moduleCount: number
  candidates: Array<{
    moduleId: string
    globalMarker: boolean
    exportKey: string
    source: string
    getters: Record<string, string>
    rejection: string | null
  }>
}

export function attachmentApiFromRuntime(runtime: unknown): AttachmentApi | null {
  return inspectAttachmentRuntime(runtime).api
}

export function inspectAttachmentRuntime(runtime: unknown): { api: AttachmentApi | null; report: AttachmentRuntimeReport } {
  const req = (runtime as { __webpack_require__?: { c?: Record<string, { exports?: unknown }> } })?.__webpack_require__
  const modules = Object.entries(req?.c ?? {})
  const report: AttachmentRuntimeReport = { cacheAvailable: Boolean(req?.c), moduleCount: modules.length, candidates: [] }
  let result: AttachmentApi | null = null
  let ambiguous = false
  for (const [moduleId, module] of modules) {
    try {
      const exports = module?.exports
      if (!exports || typeof exports !== 'object') continue
      const descriptors = Object.entries(Object.getOwnPropertyDescriptors(exports))
      const values = descriptors.map(([, descriptor]) => {
        try { return descriptor.get ? descriptor.get.call(exports) : descriptor.value } catch { return undefined }
      })
      const globalMarker = values.includes('chatgpt-global')
      for (const [index, value] of values.entries()) {
        if (typeof value !== 'function') continue
        const code = Function.prototype.toString.call(value)
        const hasTrim = /\.\s*trim\s*\(\s*\)/.test(code)
        const hasWrite = /\.\s*set\s*\(/.test(code)
        if (!(hasTrim && hasWrite && (globalMarker || /\bwidgetContextId\b/.test(code)))) continue
        const candidate = {
          moduleId, globalMarker, exportKey: descriptors[index][0], source: code.slice(0, 3000),
          getters: Object.fromEntries(descriptors.filter(([, descriptor]) => descriptor.get)
            .map(([key, descriptor]) => [key, Function.prototype.toString.call(descriptor.get).slice(0, 300)])),
          rejection: null as string | null
        }
        // Cap diagnostics without limiting discovery. Sources contain website
        // code only; never read the current scope's attachment or prompt state.
        if (report.candidates.length < 8) report.candidates.push(candidate)
        if (!globalMarker) { candidate.rejection = 'global-marker'; continue }
        if (![/\bid\s*:/, /\btext\s*:/, /\bsource\s*:/].every((pattern) => pattern.test(code))) {
          candidate.rejection = 'attachment-fields'; continue
        }
        // Match the scope and conversation arguments as well as the binding.
        // Never probe unrelated stores or call candidate functions to discover it.
        const params = code.match(/^(?:function(?:\s+[\w$]+)?\s*)?\(\s*([\w$]+)\s*,\s*([\w$]+)\s*,/)
        if (!params) { candidate.rejection = 'parameters'; continue }
        const writes = [...code.matchAll(/([\w$]+)\s*\.\s*set\s*\(\s*([\w$]+)\s*,\s*([\w$]+)\s*,/g)]
        if (writes.length !== 1 || writes[0][1] !== params[1] || writes[0][3] !== params[2]) {
          candidate.rejection = 'scope-write'; continue
        }
        const bindingName = writes[0][2]
        const bindings = descriptors.flatMap(([, descriptor], index) => {
          if (!descriptor.get) return []
          // Rspack's live export getters retain the closure variable name, even
          // when the module ID, export key and local identifiers are renumbered.
          const getter = Function.prototype.toString.call(descriptor.get)
          const name = getter.match(/^\s*\(\s*\)\s*=>\s*([\w$]+)\s*$/)?.[1] ??
            getter.match(/^\s*(?:function(?:\s+[\w$]+)?\s*\(\s*\)|\(\s*\)\s*=>)\s*\{\s*return\s+([\w$]+)\s*;?\s*\}\s*$/)?.[1]
          const binding = values[index]
          return name === bindingName && binding != null &&
            (typeof binding === 'object' || typeof binding === 'function') ? [binding] : []
        })
        const uniqueBindings = [...new Set(bindings)]
        if (uniqueBindings.length !== 1) { candidate.rejection = 'list-binding'; continue }
        const api = { add: value as AttachmentApi['add'], list: uniqueBindings[0] }
        if (result && (result.add !== api.add || result.list !== api.list)) {
          ambiguous = true
          candidate.rejection = 'ambiguous-api'
        }
        result = api
      }
    } catch {
      // A partially initialized module can expose getters in the temporal dead
      // zone. Skip it without preventing other loaded modules from matching.
    }
  }
  return { api: ambiguous ? null : result, report }
}

export type NativeAttachmentHandle = (() => void) & { id: string; isPresent(): boolean }

export function addNativeAttachment(api: AttachmentApi, scope: NativeScope, conversationId: string, markdown: string): NativeAttachmentHandle | null {
  const before = scope.get(api.list, conversationId)
  if (!Array.isArray(before)) return null
  const ids = new Set(before.map((entry: NativeAttachment) => entry.id))
  api.add(scope, conversationId, markdown)
  const after = scope.get(api.list, conversationId)
  if (!Array.isArray(after)) return null
  const added = after.find((entry: NativeAttachment) => !ids.has(entry.id) && entry.text === markdown.trim())
  if (!added) return null
  // Roll back only our attachment, preserving concurrent user changes.
  return Object.assign(
    () => scope.set(api.list, conversationId, (entries) => entries.filter((entry) => entry.id !== added.id)),
    {
      id: added.id,
      isPresent: () => {
        const entries = scope.get(api.list, conversationId)
        return Array.isArray(entries) && entries.some((entry: NativeAttachment) =>
          entry.id === added.id && entry.text === markdown.trim())
      }
    }
  )
}
