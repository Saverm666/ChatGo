// 悬浮窗挂载：把 Vue 组件挂载到 Shadow DOM，实现样式隔离

import type { App } from 'vue'
import type { FloatingPanelPosition, SiteAdapter } from '@/main/types'
import {
  onStorageChanged,
  readFloatingPosition,
  readSettings,
  writeFloatingPosition
} from '@/main/storage'
import { editorBridge, type OpenEditorPayload } from '@/content/editor-bridge'
import {
  getDefaultFloatingRatio,
  positionToRatio,
  ratioToPosition,
  type FloatingRatio
} from '@/content/floating-geometry'

let mounted = false
let app: App | null = null
let host: HTMLDivElement | null = null
let shadow: ShadowRoot | null = null
let currentAdapter: SiteAdapter | null = null
let panelLoadPromise: Promise<void> | null = null
let bootstrapCleanup: (() => void) | null = null
let bootstrapPositionRatio: FloatingRatio = getDefaultFloatingRatio()

let editorApp: App | null = null
let editorHost: HTMLDivElement | null = null
let unsubBridge: (() => void) | null = null
let unsubStorage: (() => void) | null = null

async function loadFloatingRuntime() {
  const [
    { createApp },
    { createPinia },
    { default: FloatingPanel },
    { default: floatingStyles }
  ] = await Promise.all([
    import('vue'),
    import('pinia'),
    import('@/content/FloatingPanel.vue'),
    import('@/content/floating-panel.css?inline')
  ])
  return { createApp, createPinia, FloatingPanel, floatingStyles }
}

type FloatingRuntime = Awaited<ReturnType<typeof loadFloatingRuntime>>
let runtimePromise: Promise<FloatingRuntime> | null = null
let editorRuntimePromise: Promise<Awaited<ReturnType<typeof loadEditorRuntime>>> | null = null

function getFloatingRuntime(): Promise<FloatingRuntime> {
  runtimePromise ??= loadFloatingRuntime().catch((error) => {
    runtimePromise = null
    throw error
  })
  return runtimePromise
}

async function loadEditorRuntime() {
  const [runtime, { default: PromptEditor }, { default: katexStyles }] = await Promise.all([
    getFloatingRuntime(),
    import('@/content/ui/PromptEditor.vue'),
    import('katex/dist/katex.min.css?inline')
  ])
  return { runtime, PromptEditor, katexStyles }
}

function getEditorRuntime(): ReturnType<typeof loadEditorRuntime> {
  editorRuntimePromise ??= loadEditorRuntime().catch((error) => {
    editorRuntimePromise = null
    throw error
  })
  return editorRuntimePromise
}

// Shadow Root :host 变量块：悬浮窗与编辑器共用，保证样式隔离 + 变量自包含
const HOST_VARS_CSS = `
  :host {
    all: initial;
    --cg-black: #0B0F19;
    --cg-white: #FFFFFF;
    --cg-ink: #111827;
    --cg-gray-50: #F9FAFB;
    --cg-gray-100: #F3F4F6;
    --cg-gray-200: #E5E7EB;
    --cg-gray-300: #D1D5DB;
    --cg-gray-400: #9CA3AF;
    --cg-gray-500: #6B7280;
    --cg-gray-600: #4B5563;
    --cg-gray-700: #374151;
    --cg-accent-50: #EFF6FF;
    --cg-accent-100: #DBEAFE;
    --cg-accent-200: #BFDBFE;
    --cg-accent-400: #60A5FA;
    --cg-accent-500: #3B82F6;
    --cg-accent-600: #2563EB;
    --cg-text: var(--cg-black);
    --cg-text-muted: var(--cg-gray-500);
    --cg-text-soft: var(--cg-gray-600);
    --cg-bg: var(--cg-white);
    --cg-bg-soft: var(--cg-gray-50);
    --cg-bg-hover: var(--cg-gray-100);
    --cg-border: var(--cg-gray-200);
    --cg-border-strong: var(--cg-gray-300);
    --cg-accent: var(--cg-accent-500);
    --cg-accent-soft: var(--cg-accent-100);
    --cg-accent-subtle: var(--cg-accent-50);
    --cg-danger: #DC2626;
    --cg-font-display: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --cg-font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --cg-font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
    --cg-radius: 16px;
    --cg-radius-lg: 20px;
    --cg-radius-sm: 10px;
    --cg-radius-xs: 6px;
    --cg-shadow-sm: 0 1px 2px rgba(11, 15, 25, 0.05);
    --cg-shadow: 0 4px 12px rgba(11, 15, 25, 0.08);
    --cg-shadow-md: 0 8px 24px rgba(11, 15, 25, 0.12);
    --cg-shadow-lg: 0 16px 40px rgba(11, 15, 25, 0.16);
    --cg-shadow-accent: 0 0 0 1px rgba(59, 130, 246, 0.14), 0 8px 24px rgba(59, 130, 246, 0.18);
  }
  * { box-sizing: border-box; }
`

// 等待 body 可用（content script 在 document_start 注入时 body 可能不存在）
function waitForBody(): Promise<void> {
  return new Promise((resolve) => {
    if (document.body) {
      resolve()
      return
    }
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect()
        resolve()
      }
    })
    observer.observe(document.documentElement, { childList: true })
    // 兜底超时
    window.setTimeout(() => {
      observer.disconnect()
      resolve()
    }, 5000)
  })
}

// 把 CSS 变量 + 悬浮窗样式注入 Shadow Root
function injectShadowStyles(root: ShadowRoot, floatingStyles: string, extraStyles = ''): void {
  const style = document.createElement('style')
  style.textContent = `${HOST_VARS_CSS}\n${floatingStyles}\n${extraStyles}`
  root.appendChild(style)
}

const BOOTSTRAP_FAB_SIZE = 52
const BOOTSTRAP_VIEWPORT_MARGIN = 8

function isStoredRatio(position: FloatingPanelPosition | null): position is FloatingRatio {
  return Boolean(
    position &&
    typeof position.xRatio === 'number' &&
    typeof position.yRatio === 'number'
  )
}

function getViewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

async function resolveBootstrapRatio(
  position: FloatingPanelPosition | null
): Promise<FloatingRatio> {
  if (isStoredRatio(position)) return position
  if (typeof position?.x === 'number' && typeof position?.y === 'number') {
    const ratio = positionToRatio(
      { x: position.x, y: position.y },
      getViewport(),
      BOOTSTRAP_FAB_SIZE,
      BOOTSTRAP_VIEWPORT_MARGIN
    )
    await writeFloatingPosition(ratio)
    return ratio
  }
  return getDefaultFloatingRatio()
}

function mountBootstrapButton(root: ShadowRoot, initialRatio: FloatingRatio): void {
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    .chatgo-bootstrap-button {
      position: fixed; z-index: 2147483647;
      width: 52px; height: 52px; padding: 0; border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, 0.32);
      background: rgba(255, 255, 255, 0.94); color: #111827;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 16px 38px rgba(15, 23, 42, 0.18);
      cursor: grab; pointer-events: auto; touch-action: none; user-select: none;
    }
    .chatgo-bootstrap-button:hover { transform: translateY(-1px); }
    .chatgo-bootstrap-button[data-dragging="true"] { cursor: grabbing; transform: scale(1.04); }
    .chatgo-bootstrap-button[aria-busy="true"] { cursor: wait; opacity: 0.75; }
    .chatgo-bootstrap-button svg { width: 35px; height: 35px; display: block; margin: auto; }
  `
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'chatgo-bootstrap-button'
  button.setAttribute('aria-label', '打开 ChatGo')
  button.innerHTML = `
    <svg viewBox="120 120 260 260" aria-hidden="true">
      <path d="M170 140H330A30 30 0 0 1 360 170V270A30 30 0 0 1 330 300H220L160 350V300A30 30 0 0 1 140 270V170A30 30 0 0 1 170 140Z" fill="#fff" stroke="#1a1a1a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="185" y="185" width="130" height="30" rx="10" fill="#e8f4ff"/>
      <rect x="185" y="230" width="90" height="30" rx="10" fill="#4ba3ff"/>
    </svg>
  `

  let ratio = initialRatio
  let pointerId: number | null = null
  let moved = false
  let startX = 0
  let startY = 0
  let offsetX = 0
  let offsetY = 0

  const applyPosition = (): void => {
    const point = ratioToPosition(
      ratio,
      getViewport(),
      BOOTSTRAP_FAB_SIZE,
      BOOTSTRAP_VIEWPORT_MARGIN
    )
    button.style.left = `${point.x}px`
    button.style.top = `${point.y}px`
  }

  const openPanel = (): void => {
    button.setAttribute('aria-busy', 'true')
    mountPanel(true).catch((error) => {
      button.removeAttribute('aria-busy')
      console.error('[ChatGo] 悬浮窗加载失败。', error)
    })
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return
    if (Math.abs(event.clientX - startX) > 4 || Math.abs(event.clientY - startY) > 4) {
      moved = true
    }
    const point = ratioToPosition(
      positionToRatio(
        { x: event.clientX - offsetX, y: event.clientY - offsetY },
        getViewport(),
        BOOTSTRAP_FAB_SIZE,
        BOOTSTRAP_VIEWPORT_MARGIN
      ),
      getViewport(),
      BOOTSTRAP_FAB_SIZE,
      BOOTSTRAP_VIEWPORT_MARGIN
    )
    ratio = positionToRatio(
      point,
      getViewport(),
      BOOTSTRAP_FAB_SIZE,
      BOOTSTRAP_VIEWPORT_MARGIN
    )
    bootstrapPositionRatio = ratio
    applyPosition()
  }

  const finishPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return
    const canceled = event.type === 'pointercancel'
    pointerId = null
    button.removeAttribute('data-dragging')
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finishPointer)
    window.removeEventListener('pointercancel', finishPointer)
    if (moved) {
      writeFloatingPosition(ratio).catch((error) => {
        console.warn('[ChatGo] 悬浮按钮位置保存失败。', error)
      })
    } else if (!canceled) {
      openPanel()
    }
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointerId !== null) return
    event.preventDefault()
    const rect = button.getBoundingClientRect()
    pointerId = event.pointerId
    moved = false
    startX = event.clientX
    startY = event.clientY
    offsetX = event.clientX - rect.left
    offsetY = event.clientY - rect.top
    button.setAttribute('data-dragging', 'true')
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
  })
  button.addEventListener('click', (event) => {
    // 鼠标/触摸由 pointerup 处理；保留键盘触发。
    if (event.detail === 0) openPanel()
  })
  const onResize = (): void => applyPosition()
  window.addEventListener('resize', onResize)

  bootstrapPositionRatio = ratio
  applyPosition()
  root.append(style, button)
  bootstrapCleanup = () => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finishPointer)
    window.removeEventListener('pointercancel', finishPointer)
    bootstrapCleanup = null
  }
}

async function mountPanel(initialExpanded: boolean): Promise<void> {
  if (app || panelLoadPromise) return panelLoadPromise ?? Promise.resolve()
  panelLoadPromise = (async () => {
    const runtime = await getFloatingRuntime()
    if (!mounted || !shadow || !currentAdapter) return
    bootstrapCleanup?.()
    shadow.replaceChildren()
    injectShadowStyles(shadow, runtime.floatingStyles)
    const mountPoint = document.createElement('div')
    mountPoint.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; pointer-events: none; z-index: 2147483647;'
    shadow.appendChild(mountPoint)
    app = runtime.createApp(runtime.FloatingPanel, {
      adapter: currentAdapter,
      initialExpanded,
      initialPositionRatio: bootstrapPositionRatio
    })
    app.use(runtime.createPinia())
    app.mount(mountPoint)
  })().finally(() => {
    panelLoadPromise = null
  })
  return panelLoadPromise
}

async function mountEditor(payload: OpenEditorPayload): Promise<void> {
  if (editorHost) return
  const { runtime, PromptEditor, katexStyles } = await getEditorRuntime()
  if (!mounted || editorHost) return
  editorHost = document.createElement('div')
  editorHost.id = 'chatgo-editor-host'
  editorHost.className = 'chatgo-editor-root'
  editorHost.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;'
  document.body.appendChild(editorHost)

  // 与悬浮窗一致：用 Shadow DOM 隔离宿主页面样式，并在 :host 注入变量
  const editorShadow = editorHost.attachShadow({ mode: 'open' })
  injectShadowStyles(editorShadow, runtime.floatingStyles, katexStyles)

  const mountPoint = document.createElement('div')
  editorShadow.appendChild(mountPoint)

  editorApp = runtime.createApp(PromptEditor, { ...payload })
  editorApp.use(runtime.createPinia())
  editorApp.mount(mountPoint)
}

function unmountEditor(): void {
  if (!editorHost) return
  editorApp?.unmount()
  editorApp = null
  editorHost.remove()
  editorHost = null
}

function handleEditorBridge(payload: OpenEditorPayload | null): void {
  if (payload) {
    mountEditor(payload).catch((error) => {
      console.error('[ChatGo] 编辑器加载失败。', error)
    })
  } else {
    unmountEditor()
  }
}

export const floatingPanel = {
  async enable(adapter: SiteAdapter): Promise<void> {
    if (mounted) return

    const settings = await readSettings()
    if (!settings.floatingPanelEnabled) return

    // 等 body 与保存位置并行读取，避免轻量按钮先出现在错误位置再跳动。
    const [, storedPosition] = await Promise.all([waitForBody(), readFloatingPosition()])
    bootstrapPositionRatio = await resolveBootstrapRatio(storedPosition)

    host = document.createElement('div')
    host.id = 'chatgo-floating-host'
    host.className = 'chatgo-floating-root'
    // 脱离文档流，避免影响页面布局/滚动条
    host.style.cssText = 'all: initial; position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; z-index: 2147483647; pointer-events: none; overflow: visible;'
    document.body.appendChild(host)
    shadow = host.attachShadow({ mode: 'open' })
    currentAdapter = adapter
    mountBootstrapButton(shadow, bootstrapPositionRatio)
    mounted = true

    unsubBridge = editorBridge.on(handleEditorBridge)

    // 监听设置变化，开关悬浮窗
    unsubStorage = onStorageChanged((changes, area) => {
      if (area !== 'local') return
      if ('floatingPanelEnabled' in changes) {
        const next = changes.floatingPanelEnabled?.newValue
        if (next === false) this.disable()
      }
    })
    console.log('[ChatGo] 悬浮窗已挂载。')
  },

  disable(): void {
    if (!mounted) return
    unsubStorage?.()
    unsubStorage = null
    unsubBridge?.()
    unsubBridge = null
    unmountEditor()
    bootstrapCleanup?.()
    app?.unmount()
    app = null
    host?.remove()
    host = null
    shadow = null
    currentAdapter = null
    panelLoadPromise = null
    mounted = false
  },

  isMounted(): boolean {
    return mounted
  }
}
