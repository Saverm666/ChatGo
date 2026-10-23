import { findNativeComposer, hasNativeAttachmentPreview, hasNewNativeQuoteText, matchingNativeQuoteElements, nativeComposerContainer } from './sites/chatgpt-native'
import { addNativeAttachment, attachmentApiFromRuntime, conversationIdFromUrl, findComposerScope } from './modules/chatgpt-native-runtime'
import { discoverAttachmentApi, type NativeLoadReport } from './modules/chatgpt-native-loader'
import { version } from '../../package.json'

// 运行在 ChatGPT 页面的 MAIN world。调用网站自身的引用状态与提交转换函数，
// 让卡片与提交内容都由原生实现管理。站点版本不兼容时由隔离世界回退到 Markdown。

const REQUEST_TYPE = 'chatgo:attach-native-quote'
const RESULT_TYPE = 'chatgo:attach-native-quote-result'
const CANCEL_TYPE = 'chatgo:cancel-native-quote'
const pendingRequests = new Map<string, AbortController>()

interface NativeQuoteRequest {
  source: 'chatgo-content'
  type: typeof REQUEST_TYPE | typeof CANCEL_TYPE
  id: string
  messageId: string
  label: string
  markdown: string
  expiresAt: number
  pageUrl: string
}

interface TargetedContentStore {
  getState(): {
    targetedContent?: unknown
    setTargetedContent(content: unknown): void
  }
}

type CompletionTransformer = (params: {
  completionParams: unknown
  selectedText: string
  targetedReplyLabel: string
  sourceMessageId: string
  sourceMessageRole: string
}) => unknown

function findChatGptModuleUrl(): string | null {
  const resources = performance.getEntriesByType('resource')
  const urls = resources.map((entry) => entry.name)
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    urls.push(script.src)
  }
  return urls.find((url) => /\/conversation-small-[^/]+\.js(?:\?|$)/.test(url)) ?? null
}

function findNativeFunctions(exports: Record<string, unknown>): {
  store: TargetedContentStore
  transform: CompletionTransformer
} | null {
  let store: TargetedContentStore | null = null
  let transform: CompletionTransformer | null = null
  for (const value of Object.values(exports)) {
    if (!store && value && typeof value === 'function' && 'getState' in value) {
      const candidate = value as unknown as TargetedContentStore
      try {
        if (typeof candidate.getState()?.setTargetedContent === 'function') store = candidate
      } catch {
        // 不是目标状态容器。
      }
    }
    if (!transform && typeof value === 'function') {
      const source = Function.prototype.toString.call(value)
      if (
        source.includes('sourceMessageRole') &&
        source.includes('targetedReplyLabel') &&
        source.includes('targeted_reply_source_message_id')
      ) transform = value as CompletionTransformer
    }
    if (store && transform) return { store, transform }
  }
  return null
}

let nativeFunctionsPromise: Promise<ReturnType<typeof findNativeFunctions>> | null = null

function loadNativeFunctions(): Promise<ReturnType<typeof findNativeFunctions>> {
  nativeFunctionsPromise ??= (async () => {
    const url = findChatGptModuleUrl()
    if (!url) return null
    const pageModule = await import(/* @vite-ignore */ url) as Record<string, unknown>
    return findNativeFunctions(pageModule)
  })().catch(() => null)
  const result = nativeFunctionsPromise
  void result.then((native) => { if (!native) nativeFunctionsPromise = null })
  return result
}

let attachmentApi: ReturnType<typeof attachmentApiFromRuntime> = null
let attachmentLoadReport: NativeLoadReport | null = null
const loadedRuntimes = new Map<string, unknown>()

async function loadAttachmentApi(expiresAt: number) {
  if (attachmentApi) return attachmentApi
  // Resource timing can already have dropped the startup entries. Include the
  // document's module scripts, which still point to the active build's runtime.
  const urls = [...new Set([
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'), (script) => script.src),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (script) => script.src),
    ...performance.getEntriesByType('resource').map((entry) => entry.name),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'), (link) => link.href)
  ])].filter((url) => {
    try {
      const parsed = new URL(url)
      return parsed.origin === location.origin && /^\/cdn\/assets\/[^/]+\.js$/.test(parsed.pathname)
    } catch { return false }
  })
  const result = await discoverAttachmentApi(urls, expiresAt, async (url) => {
    if (loadedRuntimes.has(url)) return loadedRuntimes.get(url)
    const runtime = await import(/* @vite-ignore */ url)
    loadedRuntimes.set(url, runtime)
    return runtime
  }, loadedRuntimes)
  attachmentLoadReport = result.report
  if (result.api) attachmentApi = result.api
  return result.api
}

interface QuoteContext {
  composer: HTMLElement
  // 输入框所属容器（登录态会话页是 form[data-chatgpt-composer]，工作分支页另有形态）。
  // 原生附件卡片与引用预览都渲染在这里面。
  container: Element
  signal: AbortSignal
  isCurrent(): boolean
}

async function attachCurrentNativeQuote(request: NativeQuoteRequest, context: QuoteContext): Promise<{ ok: boolean; reason?: string }> {
  const api = await loadAttachmentApi(request.expiresAt)
  if (!context.isCurrent()) return { ok: false }
  if (!api) return { ok: false, reason: `原生模块解析失败（阶段：${attachmentLoadReport?.stage ?? 'unknown'}）。` }
  if (Date.now() >= request.expiresAt) return { ok: false, reason: '解析原生模块超时。' }
  const scope = findComposerScope(context.composer)
  const conversationId = conversationIdFromUrl(request.pageUrl)
  if (!scope) return { ok: false, reason: '未找到当前输入框的原生 AppScope。' }
  if (!conversationId) return { ok: false, reason: '分支仍在跳转，尚未进入对话地址。' }
  // 快照添加前容器里已有的引用文本，稍后用于区分“新卡片”与页面里本来就有的同标题文本。
  const previousQuoteText = new Map([...matchingNativeQuoteElements(context.container, request.label)]
    .map((element) => [element, element.textContent]))
  const rollback = addNativeAttachment(api, scope, conversationId, request.markdown)
  if (!rollback) return { ok: false, reason: '原生添加函数未写入已选文本附件。' }
  const deadline = Math.min(request.expiresAt - 100, Date.now() + 1600)
  let attached = false
  context.signal.addEventListener('abort', rollback, { once: true })
  try {
    do {
      await new Promise((resolve) => setTimeout(resolve, 40))
      if (!context.isCurrent() || Date.now() >= request.expiresAt) break
      if (!rollback.isPresent()) continue
      // The new attachment ID is unique. It also identifies cards rendered in
      // a sibling region or a portal outside the editor's nearest container.
      const cardVisible = hasNativeAttachmentPreview(context.container, rollback.id) ||
        hasNativeAttachmentPreview(context.composer.ownerDocument.body, rollback.id) ||
        hasNewNativeQuoteText(context.container, request.label, previousQuoteText)
      if (cardVisible) {
        attached = true
        return { ok: true }
      }
    } while (Date.now() < deadline)
    return { ok: false, reason: '原生附件已写入，但卡片未显示，已撤销本次附件。' }
  } finally {
    context.signal.removeEventListener('abort', rollback)
    if (!attached) rollback()
  }
}

function respond(id: string, ok: boolean, reason?: string, cancelled = false): void {
  if (!ok && !cancelled) console.info('[ChatGo] 原生引用诊断', { version, reason, loader: attachmentLoadReport })
  window.postMessage({ source: 'chatgo-page', type: RESULT_TYPE, id, ok, reason, cancelled }, window.location.origin)
}

// Read-only probe: no attachment or chat text is read or changed. It also proves
// which extension build is running, independently of the Markdown fallback.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return
  if (event.data?.source !== 'chatgo-content' || event.data.type !== 'chatgo:diagnose-native-quote' || typeof event.data.id !== 'string') return
  const id = event.data.id
  void (async () => {
    const api = await loadAttachmentApi(Date.now() + 1600)
    const composer = findNativeComposer()
    window.postMessage({
      source: 'chatgo-page', type: 'chatgo:diagnose-native-quote-result', id,
      version, composer: Boolean(composer), appScope: Boolean(composer && findComposerScope(composer)),
      conversation: Boolean(conversationIdFromUrl(location.href)), api: Boolean(api), loader: attachmentLoadReport
    }, location.origin)
  })().catch(() => {
    window.postMessage({ source: 'chatgo-page', type: 'chatgo:diagnose-native-quote-result', id, version, error: '诊断执行失败' }, location.origin)
  })
})

window.addEventListener('message', (event: MessageEvent<NativeQuoteRequest>) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const request = event.data
  if (request?.source !== 'chatgo-content' || typeof request.id !== 'string') return
  if (request.type === CANCEL_TYPE) {
    pendingRequests.get(request.id)?.abort()
    return
  }
  if (
    request.type !== REQUEST_TYPE || typeof request.messageId !== 'string' ||
    typeof request.label !== 'string' || typeof request.markdown !== 'string' ||
    typeof request.pageUrl !== 'string' || !Number.isFinite(request.expiresAt) ||
    pendingRequests.has(request.id)
  ) return

  // Capture the destination before loading modules. Never attach a late result
  // to a newly mounted editor or another conversation.
  if (location.href !== request.pageUrl || Date.now() >= request.expiresAt) {
    respond(request.id, false, undefined, true)
    return
  }
  // 输入框不再限定在 form[data-chatgpt-composer] 内：工作分支页（?surface=work）的
  // 输入框容器不是那个 form，这正是“分支到工作”退回 Markdown 引用的原因。
  const composer = findNativeComposer()
  const container = composer ? nativeComposerContainer(composer) : null
  if (!composer || !container) {
    // 找不到输入框要按“原生不可用”回报，让隔离世界继续写入 Markdown 引用；
    // 用 cancelled 回报会让两个世界都不写内容。
    respond(request.id, false, '当前页面未找到可用的 ChatGPT 输入框。')
    return
  }
  const controller = new AbortController()
  const context: QuoteContext = {
    composer, container, signal: controller.signal,
    isCurrent: () => !controller.signal.aborted && composer.isConnected &&
      location.href === request.pageUrl && findNativeComposer() === composer
  }
  pendingRequests.set(request.id, controller)
  void (async () => {
    const current = await attachCurrentNativeQuote(request, context)
    if (!context.isCurrent()) { respond(request.id, false, undefined, true); return }
    if (current.ok) { respond(request.id, true); return }
    const native = await loadNativeFunctions()
    if (!context.isCurrent()) { respond(request.id, false, undefined, true); return }
    if (!native || Date.now() >= request.expiresAt) {
      respond(request.id, false, current.reason ?? '未找到可调用的 ChatGPT 原生引用函数。')
      return
    }
    const { store, transform } = native
    const previous = store.getState().targetedContent
    const previousElements = new Map([...matchingNativeQuoteElements(container, request.label)]
      .map((element) => [element, element.textContent]))
    const previousLabel = previous && typeof previous === 'object' && 'label' in previous ? previous.label : undefined
    const targetedContent = {
      type: 'text', label: request.label,
      createNewCompletionParams: (completionParams: unknown) => transform({
        completionParams, selectedText: request.markdown, targetedReplyLabel: request.label,
        sourceMessageId: request.messageId, sourceMessageRole: 'assistant'
      })
    }
    const rollback = () => {
      if (store.getState().targetedContent === targetedContent) store.getState().setTargetedContent(previous)
    }
    let attached = false
    controller.signal.addEventListener('abort', rollback, { once: true })
    try {
      store.getState().setTargetedContent(targetedContent)
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      if (!context.isCurrent()) { respond(request.id, false, undefined, true); return }
      const visible = [...matchingNativeQuoteElements(container, request.label)].some((element) =>
        !previousElements.has(element) || element.textContent !== previousElements.get(element) || previousLabel === request.label)
      attached = Date.now() < request.expiresAt && store.getState().targetedContent === targetedContent && visible
      respond(request.id, attached, attached ? undefined : '原生引用状态未显示在输入框中。')
    } finally {
      controller.signal.removeEventListener('abort', rollback)
      if (!attached) rollback()
    }
  })().catch(() => respond(request.id, false, '原生引用函数调用失败。', !context.isCurrent()))
    .finally(() => pendingRequests.delete(request.id))
})

export {}
