// ChatGPT 提问导航。只索引已经加载到页面的轮次；官方目录出现时主动让位。
import type { SiteAdapter } from '@/main/types'

interface PromptNode {
  turn: HTMLElement
  title: string
  key: string
}

const MIN_PROMPTS = 2
const MAX_TITLE_LENGTH = 60
const UPDATE_DELAY_MS = 120
const HOST_ID = 'chatgo-conversation-navigator'

let adapter: SiteAdapter | null = null
let enabled = false
let observer: MutationObserver | null = null
let themeObserver: MutationObserver | null = null
let updateTimer: number | null = null
let scrollFrame: number | null = null
let host: HTMLDivElement | null = null
let shadow: ShadowRoot | null = null
let prompts: PromptNode[] = []
let renderedSignature = ''
let needsIndexUpdate = true
let activeIndex = -1
let activeButtons: HTMLElement[][] = []

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function collectPrompts(): PromptNode[] {
  const turnSelector = adapter?.selectors.messageTurn
  const userSelector = adapter?.selectors.userMessage
  if (!turnSelector || !userSelector) return []

  const seen = new Set<Element>()
  const result: PromptNode[] = []
  for (const element of document.querySelectorAll(turnSelector)) {
    if (!(element instanceof HTMLElement)) continue
    const user = element.matches(userSelector) ? element : element.querySelector(userSelector)
    if (!user || seen.has(user)) continue
    seen.add(user)

    const text = (user instanceof HTMLElement ? user.innerText || user.textContent : user.textContent) ?? ''
    const title = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH)
    if (!title) continue
    const key = element.getAttribute('data-turn-key')
      ?? element.getAttribute('data-turn-id')
      ?? element.getAttribute('data-testid')
      ?? user.getAttribute('data-message-id')
      ?? String(result.length)
    result.push({ turn: element, title, key })
  }
  return result
}

function hasNativeNavigator(items: PromptNode[]): boolean {
  const selector = adapter?.selectors.nativeConversationNavigator
  if (selector && Array.from(document.querySelectorAll(selector)).some(isVisible)) return true

  // 旧版目录可能不带测试属性；用右侧按钮的提问标签补充识别。
  if (items.length < MIN_PROMPTS) return false
  const labels = items.map((item) => item.title.slice(0, 16)).filter((label) => label.length >= 8)
  const matched = new Set<string>()
  for (const button of document.querySelectorAll('button[title], button[aria-label]')) {
    const name = `${button.getAttribute('title') ?? ''} ${button.getAttribute('aria-label') ?? ''}`
    const label = labels.find((candidate) => name.includes(candidate))
    if (!label || !isVisible(button)) continue
    if (button.getBoundingClientRect().left < window.innerWidth * 0.6) continue
    matched.add(label)
    if (matched.size >= MIN_PROMPTS) return true
  }
  return false
}

function createHost(): void {
  if (host?.isConnected) return
  removeHost()
  host = document.createElement('div')
  host.id = HOST_ID
  shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; position: fixed; right: 16px; top: 50%; transform: translateY(-50%);
      z-index: 2147483000; width: 36px; color: #0d0d0d;
      --toc-surface: #fff; --toc-text: #0d0d0d; --toc-muted: #a6a6a6;
      --toc-hover: #666; --toc-row-hover: #f5f5f5;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    :host([data-theme="dark"]) { color: #f4f4f4; --toc-surface: #353535;
      --toc-text: #f4f4f4; --toc-muted: #858585; --toc-hover: #c5c5c5;
      --toc-row-hover: #454545; }
    * { box-sizing: border-box; }
    .rail { display: flex; flex-direction: column; gap: 8px; align-items: center;
      max-height: 50lvh; overflow: auto; width: 36px; padding: 4px 0;
      background: transparent; scrollbar-width: none; }
    .rail::-webkit-scrollbar { display: none; }
    button { font: inherit; cursor: pointer; }
    .mark { display: block; flex: none; width: 18px; height: 2px; padding: 0;
      border: 0; border-radius: 999px; background: var(--toc-muted);
      transition: background-color 160ms ease; }
    .mark[data-active="true"] { background: var(--toc-text); }
    .mark:hover, .mark:focus-visible { background: var(--toc-hover); outline: none; }
    .panel { position: absolute; right: 0; top: 50%; transform: translate(4px, -50%);
      width: min(340px, calc(100vw - 32px)); max-height: 50lvh;
      overflow: auto; padding: 6px; border-radius: 16px;
      background: var(--toc-surface); box-shadow: 0 10px 30px #0000002b, 0 1px 3px #00000014;
      opacity: 0; visibility: hidden; pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease, visibility 160ms; }
    :host(:hover) .panel, :host(:focus-within) .panel { opacity: 1; visibility: visible;
      pointer-events: auto; transform: translate(0, -50%); }
    .item { display: block; width: 100%; padding: 7px 10px;
      border: 0; border-radius: 8px; background: transparent; color: var(--toc-text);
      text-align: left; }
    .item:hover, .item:focus-visible { background: var(--toc-row-hover); outline: none; }
    .item[data-active="true"] { font-weight: 600; }
    .item-text { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    @media (prefers-reduced-motion: reduce) { .panel, .mark { transition: none; } }
  `
  shadow.append(style)
  ;(document.body ?? document.documentElement).append(host)
  syncTheme()
}

function syncTheme(): void {
  if (!host) return
  const root = document.documentElement
  const explicitTheme = root.getAttribute('data-theme') ?? root.getAttribute('data-color-mode')
  const dark = explicitTheme === 'dark' || root.classList.contains('dark')
    || (explicitTheme == null && window.matchMedia('(prefers-color-scheme: dark)').matches)
  host.dataset.theme = dark ? 'dark' : 'light'
}

function removeHost(): void {
  host?.remove()
  host = null
  shadow = null
  renderedSignature = ''
  activeIndex = -1
  activeButtons = []
}

function jumpTo(index: number): void {
  const turn = prompts[index]?.turn
  if (!turn?.isConnected) return
  turn.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'center'
  })
  setActive(index)
}

function render(items: PromptNode[]): void {
  createHost()
  if (!shadow) return
  const signature = items.map((item) => `${item.key}:${item.title}`).join('\n')
  if (signature === renderedSignature) return
  renderedSignature = signature
  activeIndex = -1
  activeButtons = []
  shadow.querySelectorAll('.rail, .panel').forEach((element) => element.remove())

  const rail = document.createElement('div')
  rail.className = 'rail'
  rail.setAttribute('aria-label', 'ChatGo 对话节点导航')
  const panel = document.createElement('nav')
  panel.className = 'panel'
  panel.setAttribute('aria-label', 'ChatGo 已加载的提问')
  items.forEach((item, index) => {
    const mark = document.createElement('button')
    mark.type = 'button'
    mark.className = 'mark'
    mark.title = item.title
    mark.setAttribute('aria-label', `跳转到第 ${index + 1} 条提问：${item.title}`)
    mark.dataset.index = String(index)
    mark.dataset.active = 'false'
    mark.addEventListener('click', () => jumpTo(index))
    rail.append(mark)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'item'
    button.dataset.index = String(index)
    button.dataset.active = 'false'
    button.title = item.title
    const label = document.createElement('span')
    label.className = 'item-text'
    label.textContent = item.title
    button.append(label)
    button.addEventListener('click', () => jumpTo(index))
    panel.append(button)
    activeButtons.push([mark, button])
  })
  shadow.append(rail, panel)
}

function setActive(index: number): void {
  if (index === activeIndex) return
  activeButtons[activeIndex]?.forEach((element) => { element.dataset.active = 'false' })
  activeButtons[index]?.forEach((element) => { element.dataset.active = 'true' })
  activeIndex = index
}

function updateActive(): void {
  scrollFrame = null
  if (!host || prompts.length === 0) return
  const first = prompts[0].turn
  const scroller = findScroller(first)
  const rect = scroller?.getBoundingClientRect()
  const reference = rect ? rect.top + Math.min(rect.height * 0.35, 240) : window.innerHeight * 0.35
  let active = 0
  prompts.forEach((item, index) => {
    if (item.turn.getBoundingClientRect().top <= reference) active = index
  })
  setActive(active)
}

function findScroller(element: Element): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent)
    if (/(auto|scroll|overlay)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
      return parent
    }
  }
  return null
}

function scheduleActive(): void {
  if (scrollFrame !== null) return
  scrollFrame = window.requestAnimationFrame(updateActive)
}

function update(): void {
  updateTimer = null
  if (!enabled || adapter?.id !== 'chatgpt') return
  if (!needsIndexUpdate) {
    scheduleActive()
    return
  }
  needsIndexUpdate = false
  const items = collectPrompts()
  if (items.length < MIN_PROMPTS || hasNativeNavigator(items)) {
    prompts = []
    removeHost()
    return
  }
  prompts = items
  render(items)
  syncTheme()
  scheduleActive()
}

function queueUpdate(reindex: boolean): void {
  needsIndexUpdate ||= reindex
  if (updateTimer !== null) return
  updateTimer = window.setTimeout(update, UPDATE_DELAY_MS)
}

function scheduleUpdate(): void {
  queueUpdate(true)
}

function handleMutations(records: MutationRecord[]): void {
  const assistantSelector = adapter?.selectors.assistantMessage
  const userSelector = adapter?.selectors.userMessage
  if (!assistantSelector || !userSelector) { scheduleUpdate(); return }
  const relevantSelector = [adapter?.selectors.messageTurn, userSelector,
    adapter?.selectors.nativeConversationNavigator, 'button[title], button[aria-label]'].filter(Boolean).join(', ')
  // Assistant text/layout changes can move existing questions, but cannot change
  // their titles. Keep the same update interval and only refresh geometry then.
  const onlyAssistantContent = records.every((record) => {
    const element = record.target instanceof Element ? record.target : record.target.parentElement
    if (!element?.closest(assistantSelector) || element.closest(userSelector)) return false
    return [...record.addedNodes, ...record.removedNodes].every((node) =>
      !(node instanceof Element) || (!node.matches(relevantSelector) && !node.querySelector(relevantSelector)))
  })
  queueUpdate(!onlyAssistantContent)
}

export const conversationNavigator = {
  enable(siteAdapter: SiteAdapter): void {
    adapter = siteAdapter
    if (enabled) {
      scheduleUpdate()
      return
    }
    enabled = true
    observer = new MutationObserver(handleMutations)
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-mode']
    })
    window.addEventListener('scroll', scheduleActive, true)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('pointerover', scheduleUpdate, true)
    window.addEventListener('popstate', scheduleUpdate)
    window.addEventListener('hashchange', scheduleUpdate)
    scheduleUpdate()
  },
  disable(): void {
    if (!enabled) return
    enabled = false
    adapter = null
    observer?.disconnect()
    observer = null
    themeObserver?.disconnect()
    themeObserver = null
    window.removeEventListener('scroll', scheduleActive, true)
    window.removeEventListener('resize', scheduleUpdate)
    window.removeEventListener('pointerover', scheduleUpdate, true)
    window.removeEventListener('popstate', scheduleUpdate)
    window.removeEventListener('hashchange', scheduleUpdate)
    if (updateTimer !== null) window.clearTimeout(updateTimer)
    if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
    updateTimer = null
    scrollFrame = null
    prompts = []
    needsIndexUpdate = true
    removeHost()
  }
}
