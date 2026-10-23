import { hasReactAncestorKey } from '../modules/chatgpt-native-runtime.ts'

// Captured native composer and selected-text tiles (2026-09-26).
export const CHATGPT_NATIVE_FORM = 'form[data-chatgpt-composer]'
export const CHATGPT_NATIVE_COMPOSER = `${CHATGPT_NATIVE_FORM} [contenteditable="true"]`
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]'

// 会话页里的“写作块”同样是 div.ProseMirror[contenteditable="true"]，且排在真正的输入框
// 之前（2026-09-25 实测）。排除条件必须与 sites/chatgpt.ts 的
// CHATGPT_WRITING_BLOCK_EXCLUSION 完全一致；不直接 import 那个模块，是因为 MAIN world
// 桥接层与隔离世界共享模块会让打包器生成跨世界加载器（见 modules/chatgpt-native-quote.ts）。
const WRITING_BLOCK_EXCLUSION =
  ':not([data-oai-writing-block-surface] *):not([data-testid="chatgpt-writing-block"] *)'

// MAIN world 侧自行定位输入框：隔离世界无法把 DOM 引用传过世界边界，所以这里按与
// sites/chatgpt.ts 的 CHATGPT_COMPOSER_SELECTOR 相同的书写顺序逐条尝试
// （chatgpt.test.ts 有断言锁住两张列表的同序关系）。首个候选是桥接层额外的宽松兜底。
//
// 关键：不能假定输入框的容器是 form[data-chatgpt-composer]。从聊天或工作分支到“工作”
// （?surface=work）时输入框不在那个 form 内，旧实现因此在生成原生引用之前就判定
// “不是受支持的 ChatGPT 输入框”，直接退回 Markdown 引用。
export const CHATGPT_NATIVE_COMPOSER_CANDIDATES = [
  CHATGPT_NATIVE_COMPOSER,
  '[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"]',
  '[data-composer-markdown][contenteditable="true"]',
  '#prompt-textarea',
  'textarea[name="prompt-textarea"]',
  'textarea[data-testid="prompt-textarea"]',
  `div.ProseMirror[contenteditable="true"]${WRITING_BLOCK_EXCLUSION}`,
  '[contenteditable="true"][data-lexical-editor="true"]',
  '[data-mobile-composer-prompt]',
  'textarea#mobile-composer-prompt',
  '[data-octane-lexical-root][contenteditable="true"]',
  'form[data-mobile-composer] textarea',
  '[data-composer-editor-host] textarea'
]

function visible(element: Element): boolean {
  if (!element.isConnected || element.getClientRects().length === 0) return false
  const style = getComputedStyle(element)
  return style.visibility !== 'hidden' && style.visibility !== 'collapse'
}

export function findNativeComposer(): HTMLElement | null {
  for (const selector of CHATGPT_NATIVE_COMPOSER_CANDIDATES) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (visible(element)) return element
    }
  }
  return null
}

// 原生附件卡片与引用预览都渲染在输入框所属的容器内。登录态会话页的容器是
// form[data-chatgpt-composer]，工作分支页的容器形态不同，因此逐级回退而不写死标签。
export function nativeComposerContainer(composer: Element): Element {
  return composer.closest('[data-chatgpt-composer]') ??
    composer.closest('form') ??
    composer.parentElement ??
    composer
}

export function hasNativeAttachmentPreview(container: Element, id: string): boolean {
  // React's attachment key identifies the exact entry we just added. Preview
  // classes and text are presentation details: Markdown can be rendered,
  // abbreviated, or split across several elements. Check ownership first to
  // avoid layout/style reads for every element in a document-wide portal scan.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    const element = walker.currentNode as Element
    if (hasReactAncestorKey(element, id) && !element.closest(EDITABLE_SELECTOR) && visible(element)) return true
  }
  return false
}

// Legacy targeted-reply cards have no attachment ID. The bridge checks these
// non-editable text elements against the previous UI and matching native state.
export function matchingNativeQuoteElements(container: Element, label: string): Set<Element> {
  const snippet = label.replace(/\s+/g, ' ').trim().slice(0, 12)
  const matches = new Set<Element>()
  if (!snippet) return matches
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const element = node.parentElement
    if (element && !element.closest(EDITABLE_SELECTOR) &&
        node.textContent?.replace(/\s+/g, ' ').includes(snippet) && visible(element)) matches.add(element)
  }
  return matches
}

// 卡片类名属于页面私有实现，会随改版变化。原生附件状态里确实存在本次附件时，
// 允许用“容器内出现了新的/变化的引用标题文本”作为兜底，避免容器改版后误撤销附件。
// 必须比对添加前的快照：容器里本来就有的同标题文本（例如上一次附件的残留卡片）
// 不能算作本次附件已显示的证据。
export function hasNewNativeQuoteText(
  container: Element,
  label: string,
  previous: Map<Element, string | null>
): boolean {
  return [...matchingNativeQuoteElements(container, label)].some((element) =>
    !previous.has(element) || previous.get(element) !== element.textContent)
}
