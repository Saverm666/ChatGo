// ChatGo content script 入口
// 职责：解析适配器 → 按设置注册各功能模块 → 监听设置变化实时同步

import type { ChatGoSettings, SiteAdapter } from '@/main/types'
import { shouldEnableForSite } from '@/main/site-policy'
import { resolveAdapter } from './sites'
import { readSettings, onStorageChanged, isExtensionContextInvalidatedError } from '@/main/storage'
import { CONTENT_MODULE_SETTING_KEYS, contentFeatureModules } from './modules/registry'
import { initializeBranchDiagnostics, markBranchStartup } from './modules/branch-diagnostics'

initializeBranchDiagnostics()

let currentAdapter: SiteAdapter | null = null
let settingsSyncGeneration = 0

function disableAllModules(): void {
  contentFeatureModules.forEach((module) => module.disable())
}

// 根据设置应用各模块开关
function applySettings(settings: ChatGoSettings, adapter: SiteAdapter): void {
  currentAdapter = adapter
  const currentUrl = new URL(window.location.href)

  if (!shouldEnableForSite(settings, adapter, currentUrl)) {
    disableAllModules()
    return
  }

  contentFeatureModules.forEach((module) => {
    Promise.resolve(module.apply(settings, adapter)).catch((error) => {
      console.warn(`[ChatGo] ${module.name}启用失败。`, error)
    })
  })
}

async function syncSettings(): Promise<void> {
  markBranchStartup('page.settings-read-start')
  const generation = ++settingsSyncGeneration
  const settings = await readSettings()
  markBranchStartup('page.settings-read-end')
  if (generation !== settingsSyncGeneration) return
  const adapter = resolveAdapter(new URL(window.location.href))
  applySettings(settings, adapter)
  markBranchStartup('page.modules-applied')
}

// 监听设置变化
function setupStorageListener(): void {
  onStorageChanged((changes, area) => {
    if (area !== 'local') return
    const relevantKeys = [
      'siteActivationMode',
      'siteWhitelist',
      'siteBlacklist',
      ...CONTENT_MODULE_SETTING_KEYS
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

// 初始化站点功能与设置监听。
function bootstrap(): void {
  syncSettings()
    .then(() => setupStorageListener())
    .catch((error) => {
      console.error('[ChatGo] 初始化失败。', error)
    })
}

bootstrap()

export {}
