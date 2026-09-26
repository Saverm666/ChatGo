// Adapter for the Rspack/Maitai ChatGPT composer (captured 2026-09-26).
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
  const match = source.match(/import\s*\{\s*__webpack_require__\s+as\s+\w+\s*\}\s*from\s*["']([^"']+)["']/)
  if (!match) return null
  const target = new URL(match[1], url)
  return target.origin === 'https://chatgpt.com' && target.pathname.startsWith('/cdn/assets/')
    ? target.href : null
}

export interface AttachmentApi {
  add(scope: NativeScope, conversationId: string, text: string): void
  list: unknown
}

export function attachmentApiFromRuntime(runtime: unknown): AttachmentApi | null {
  const req = (runtime as { __webpack_require__?: { c?: Record<string, { exports?: unknown }> } })?.__webpack_require__
  const exports = req?.c?.vG?.exports as Record<string, unknown> | undefined
  if (!exports || exports.a !== 'chatgpt-global' || typeof exports.b !== 'function' || !exports.v) return null
  // The export names are private. Refuse a changed build instead of calling an
  // unrelated function after the website renumbers its exports.
  const code = Function.prototype.toString.call(exports.b)
  if (!['.trim()', 'widgetContextId', 'source:', '.set('].every((part) => code.includes(part))) return null
  return { add: exports.b as AttachmentApi['add'], list: exports.v }
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
