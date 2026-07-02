// ChatGo content script 入口
// 职责：解析适配器 → 按设置注册各功能模块 → 监听设置变化实时同步

import type { ChatGoSettings, SiteAdapter } from '@/main/types'
import { shouldEnableForSite } from '@/main/site-policy'
import { resolveAdapter } from './sites'
import { readSettings, onStorageChanged, isExtensionContextInvalidatedError } from '@/main/storage'
import { formulaCopier } from './modules/formula-copier'
import { markdownCopy } from './modules/markdown-copy'
import { enterEnhancer } from './modules/enter-enhancer'
import { collapse } from './modules/collapse'
import { branch } from './modules/branch'
import { floatingPanel } from './modules/floating-panel'

let currentAdapter: SiteAdapter | null = null

function disableAllModules(): void {
  formulaCopier.disable()
  markdownCopy.disable()
  enterEnhancer.disable()
  collapse.disable()
  branch.disable()
  floatingPanel.disable()
}

// 根据设置应用各模块开关
function applySettings(settings: ChatGoSettings, adapter: SiteAdapter): void {
  currentAdapter = adapter
  const currentUrl = new URL(window.location.href)

  if (!shouldEnableForSite(settings, adapter, currentUrl)) {
    disableAllModules()
    return
  }

  // 公式复制
  formulaCopier.setCopyFormat(settings.formulaCopyFormat)
  if (settings.formulaCopierEnabled) {
    formulaCopier.enable(adapter)
  } else {
    formulaCopier.disable()
  }

  // Markdown 复制
  markdownCopy.setFormulaWrapMode(settings.markdownFormulaWrapMode)
  if (settings.markdownCopyEnabled) {
    markdownCopy.enable(adapter)
  } else {
    markdownCopy.disable()
  }

  // 输入增强
  if (settings.enterEnhancerEnabled) {
    enterEnhancer.enable(adapter)
  } else {
    enterEnhancer.disable()
  }

  // 长对话折叠
  if (settings.collapseEnabled) {
    collapse.enable(adapter).catch((error) => {
      console.warn('[ChatGo] 长对话折叠启用失败。', error)
    })
  } else {
    collapse.disable()
  }

  // 分支提问
  if (settings.branchEnabled) {
    branch.enable(adapter)
  } else {
    branch.disable()
  }

  // 悬浮窗（最后启用，面板内会读取其他模块状态）
  if (settings.floatingPanelEnabled) {
    floatingPanel.enable(adapter).catch((error) => {
      console.warn('[ChatGo] 悬浮窗启用失败。', error)
    })
  } else {
    floatingPanel.disable()
  }
}

async function syncSettings(): Promise<void> {
  const settings = await readSettings()
  const adapter = resolveAdapter(new URL(window.location.href))
  applySettings(settings, adapter)
}

// 监听设置变化
function setupStorageListener(): void {
  onStorageChanged((changes, area) => {
    if (area !== 'local') return
    const relevantKeys = [
      'formulaCopierEnabled',
      'siteActivationMode',
      'siteWhitelist',
      'siteBlacklist',
      'formulaCopyFormat',
      'markdownCopyEnabled',
      'markdownFormulaWrapMode',
      'enterEnhancerEnabled',
      'collapseEnabled',
      'collapseKeepLatest',
      'branchEnabled',
      'floatingPanelEnabled'
    ]
    if (relevantKeys.some((k) => k in changes)) {
      syncSettings().catch((error) => {
        if (!isExtensionContextInvalidatedError(error)) {
          console.warn('[ChatGo] 同步设置失败。', error)
        }
      })
    }
  })
}

// 响应运行时消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_PAGE_INFO') {
    sendResponse({
      ok: true,
      title: document.title,
      url: window.location.href,
      hostname: window.location.hostname,
      adapterId: currentAdapter?.id ?? null,
      adapterName: currentAdapter?.name ?? null
    })
    return false
  }
  return false
})

// 文档就绪后初始化
function bootstrap(): void {
  syncSettings()
    .then(() => setupStorageListener())
    .catch((error) => {
      console.error('[ChatGo] 初始化失败。', error)
    })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
} else {
  bootstrap()
}

export {}
