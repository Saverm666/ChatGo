// 悬浮窗挂载：把 Vue 组件挂载到 Shadow DOM，实现样式隔离

import { createApp, type App } from 'vue'
import { createPinia } from 'pinia'
import FloatingPanel from '@/content/FloatingPanel.vue'
import PromptEditor from '@/content/ui/PromptEditor.vue'
import floatingStyles from '@/content/floating-panel.css?inline'
import katexStyles from 'katex/dist/katex.min.css?inline'
import type { SiteAdapter } from '@/main/types'
import { readSettings, onStorageChanged } from '@/main/storage'
import { editorBridge, type OpenEditorPayload } from '@/content/editor-bridge'

let mounted = false
let app: App | null = null
let host: HTMLDivElement | null = null
let shadow: ShadowRoot | null = null

let editorApp: App | null = null
let editorHost: HTMLDivElement | null = null
let unsubBridge: (() => void) | null = null
let unsubStorage: (() => void) | null = null

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
function injectShadowStyles(root: ShadowRoot): void {
  const style = document.createElement('style')
  style.textContent = `${HOST_VARS_CSS}\n${floatingStyles}\n${katexStyles}`
  root.appendChild(style)
}

function mountEditor(payload: OpenEditorPayload): void {
  if (editorHost) return
  editorHost = document.createElement('div')
  editorHost.id = 'chatgo-editor-host'
  editorHost.className = 'chatgo-editor-root'
  editorHost.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;'
  document.body.appendChild(editorHost)

  // 与悬浮窗一致：用 Shadow DOM 隔离宿主页面样式，并在 :host 注入变量
  const editorShadow = editorHost.attachShadow({ mode: 'open' })
  injectShadowStyles(editorShadow)

  const mountPoint = document.createElement('div')
  editorShadow.appendChild(mountPoint)

  editorApp = createApp(PromptEditor, { ...payload })
  editorApp.use(createPinia())
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
    mountEditor(payload)
  } else {
    unmountEditor()
  }
}

export const floatingPanel = {
  async enable(adapter: SiteAdapter): Promise<void> {
    if (mounted) return

    const settings = await readSettings()
    if (!settings.floatingPanelEnabled) return

    // 等 body 可用（content script 在 document_start 注入）
    await waitForBody()

    host = document.createElement('div')
    host.id = 'chatgo-floating-host'
    host.className = 'chatgo-floating-root'
    // 脱离文档流，避免影响页面布局/滚动条
    host.style.cssText = 'all: initial; position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; z-index: 2147483647; pointer-events: none; overflow: visible;'
    document.body.appendChild(host)
    shadow = host.attachShadow({ mode: 'open' })
    injectShadowStyles(shadow)

    const mountPoint = document.createElement('div')
    mountPoint.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; pointer-events: none; z-index: 2147483647;'
    shadow.appendChild(mountPoint)

    app = createApp(FloatingPanel, { adapter })
    app.use(createPinia())
    app.mount(mountPoint)
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
    app?.unmount()
    app = null
    host?.remove()
    host = null
    shadow = null
    mounted = false
  },

  isMounted(): boolean {
    return mounted
  }
}
