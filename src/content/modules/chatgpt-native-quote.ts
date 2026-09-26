import type { BranchPromptDraft } from '@/main/types'

const REQUEST_TYPE = 'chatgo:attach-native-quote'
const RESULT_TYPE = 'chatgo:attach-native-quote-result'
const CANCEL_TYPE = 'chatgo:cancel-native-quote'
const TIMEOUT_MS = 2600

interface QuoteResult {
  source: 'chatgo-page'
  type: typeof RESULT_TYPE
  id: string
  ok: boolean
  reason?: string
  cancelled?: boolean
}

export type NativeQuoteResult = 'attached' | 'fallback' | 'cancelled'

function isEditableComposer(element: HTMLElement): boolean {
  return element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement
}

// 只用于日志：失配时记录输入框当时的形态，便于对照线上 DOM 更新适配器。
function describeComposer(element: HTMLElement): string {
  const attributes = element.getAttributeNames()
    .slice(0, 6)
    .map((name) => `${name}="${element.getAttribute(name) ?? ''}"`)
  return `<${element.tagName.toLowerCase()} ${attributes.join(' ')}>`
}

export function attachChatGptNativeQuote(
  composer: HTMLElement,
  messageId: string,
  quote: NonNullable<BranchPromptDraft['nativeQuote']>,
  signal?: AbortSignal
): Promise<NativeQuoteResult> {
  if (signal?.aborted) return Promise.resolve('cancelled')
  // 这里只粗筛“当前分支页是否存在可编辑的 ChatGPT 输入框”，真正的原生能力判定交给
  // MAIN world 桥接层（它会自己定位输入框，并按原生 AppScope 与附件卡片验证后回报）。
  //
  // 不能用 form[data-chatgpt-composer] 当门槛：从聊天或工作分支到“工作”
  // （?surface=work）时输入框不在那个 form 内，原生链路会在第一步就被判为不支持，
  // 直接退回 Markdown 引用 —— 这正是本次要修的 bug。
  //
  // 该判断必须留在本文件内：与 MAIN world 共享运行时值会让打包器生成跨世界加载器
  // （见 chatgpt-native-bridge.ts 对 sites/chatgpt-native.ts 的用法）。
  if (!isEditableComposer(composer)) {
    console.info('[ChatGo] 原生引用回退：当前分支页没有可编辑的 ChatGPT 输入框。', describeComposer(composer))
    return Promise.resolve('fallback')
  }
  const id = crypto.randomUUID()
  const pageUrl = window.location.href
  return new Promise((resolve) => {
    let settled = false
    const finish = (status: NativeQuoteResult, reason?: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener('message', handleResult)
      signal?.removeEventListener('abort', onAbort)
      if (status === 'fallback' && reason) console.info(`[ChatGo] 原生引用回退：${reason}`)
      resolve(status)
    }
    const cancel = () => window.postMessage({ source: 'chatgo-content', type: CANCEL_TYPE, id }, window.location.origin)
    const isCurrent = () => !signal?.aborted && composer.isConnected && window.location.href === pageUrl
    const onAbort = () => { cancel(); finish('cancelled') }
    const handleResult = (event: MessageEvent<QuoteResult>) => {
      const result = event.data
      if (
        event.source === window && event.origin === window.location.origin &&
        result?.source === 'chatgo-page' && result.type === RESULT_TYPE && result.id === id
      ) finish(result.cancelled || !isCurrent() ? 'cancelled' : result.ok ? 'attached' : 'fallback', result.reason)
    }
    const timer = window.setTimeout(() => {
      cancel()
      finish(isCurrent() ? 'fallback' : 'cancelled', '页面原生模块响应超时。')
    }, TIMEOUT_MS)
    window.addEventListener('message', handleResult)
    signal?.addEventListener('abort', onAbort, { once: true })
    window.postMessage({
        source: 'chatgo-content',
        type: REQUEST_TYPE,
        id,
        messageId,
        label: quote.label,
        markdown: quote.markdown,
        pageUrl,
        expiresAt: Date.now() + TIMEOUT_MS
      }, window.location.origin)
  })
}
