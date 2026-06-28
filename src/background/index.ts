// ChatGo background service worker
// 职责：安装初始化、分支草稿中转、打开设置页

import { DEFAULT_SETTINGS, STORAGE_KEYS, BRANCH_DRAFT_TTL_MS } from '@/main/constants'
import type { BranchPromptDraft } from '@/main/types'
import { isExtensionContextInvalidatedError } from '@/main/storage'

// 判断分支草稿是否新鲜
function isFreshBranchDraft(draft: BranchPromptDraft | null): boolean {
  return Boolean(
    draft &&
      typeof draft.text === 'string' &&
      draft.text.trim() &&
      typeof draft.sourceTurnId === 'string' &&
      draft.sourceTurnId &&
      typeof draft.sourceTabId === 'number' &&
      Number.isFinite(draft.sourceTabId) &&
      typeof draft.createdAt === 'number' &&
      Number.isFinite(draft.createdAt) &&
      Date.now() - draft.createdAt < BRANCH_DRAFT_TTL_MS
  )
}

// 清空分支草稿
async function clearBranchDraft(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.BRANCH_DRAFT]: null })
}

// 安装/更新时合并默认设置
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS)
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored })
  console.log('[ChatGo] 已安装/更新，设置已合并')
})

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 打开设置页
  if (message?.type === 'OPEN_OPTIONS_PAGE') {
    chrome.tabs
      .create({ url: chrome.runtime.getURL('src/options/index.html') })
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '打开设置页失败。' })
      )
    return true
  }

  // 创建分支草稿
  if (message?.type === 'CREATE_BRANCH_DRAFT') {
    const draft = message.draft as BranchPromptDraft
    if (!draft?.text?.trim() || !draft.sourceTurnId || typeof draft.sourceTabId !== 'number') {
      sendResponse({ ok: false, error: '分支草稿参数不完整。' })
      return false
    }
    chrome.storage.local
      .set({ [STORAGE_KEYS.BRANCH_DRAFT]: draft })
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '保存分支草稿失败。' })
      )
    return true
  }

  // 消费分支草稿（校验是否来自同源分支）
  if (message?.type === 'CONSUME_BRANCH_DRAFT') {
    chrome.storage.local
      .get({ [STORAGE_KEYS.BRANCH_DRAFT]: null })
      .then(async (stored) => {
        const draft = (stored[STORAGE_KEYS.BRANCH_DRAFT] as BranchPromptDraft | null) ?? null
        if (!draft || !isFreshBranchDraft(draft)) {
          if (draft) await clearBranchDraft()
          sendResponse({ ok: true, data: null })
          return
        }
        const currentTabId = sender.tab?.id
        const openerTabId = sender.tab?.openerTabId
        const currentPath = String(message.pathname ?? '').trim()
        const currentReferrer = String(message.referrer ?? '').trim()
        const isDifferentTab = typeof currentTabId === 'number' && currentTabId !== draft.sourceTabId
        const isDifferentPath = !currentPath || !draft.sourcePath || currentPath !== draft.sourcePath
        const matchesOpener = typeof openerTabId === 'number' && openerTabId === draft.sourceTabId
        const matchesReferrer =
          Boolean(draft.sourceUrl) &&
          Boolean(currentReferrer) &&
          currentReferrer.startsWith(draft.sourceUrl)

        if (isDifferentTab && isDifferentPath && (matchesOpener || matchesReferrer)) {
          await clearBranchDraft()
          sendResponse({ ok: true, data: draft })
          return
        }
        sendResponse({ ok: true, data: null })
      })
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '读取分支草稿失败。' })
      )
    return true
  }

  // 清空分支草稿
  if (message?.type === 'CLEAR_BRANCH_DRAFT') {
    clearBranchDraft()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '清理分支草稿失败。' })
      )
    return true
  }

  return false
})

// 全局错误兜底：吞掉扩展上下文失效错误
self.addEventListener('error', (event) => {
  if (isExtensionContextInvalidatedError(event.error)) {
    event.preventDefault()
  }
})

export {}
