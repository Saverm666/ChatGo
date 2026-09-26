// ChatGo background service worker
// 职责：安装初始化、分支草稿中转、打开设置页

import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@/main/constants'
import type { BranchPromptDraft } from '@/main/types'
import { isExtensionContextInvalidatedError } from '@/main/storage'
import {
  canTabConsumeBranchDraft,
  canTabConsumeNativeChatGptDraft,
  canTabConsumeNativeGeminiDraft,
  isFreshBranchDraft
} from './branch-draft'

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
    const incomingDraft = message.draft as Omit<
      BranchPromptDraft,
      'sourceTabId' | 'targetTabId'
    >
    const sourceTabId = sender.tab?.id
    if (
      !incomingDraft?.text?.trim() ||
      !incomingDraft.sourceTurnId ||
      typeof sourceTabId !== 'number'
    ) {
      sendResponse({ ok: false, error: '分支草稿参数不完整。' })
      return false
    }
    const draft: BranchPromptDraft = {
      ...incomingDraft,
      sourceTabId,
      targetTabId: undefined
    }
    chrome.storage.local
      .set({ [STORAGE_KEYS.BRANCH_DRAFT]: draft })
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '保存分支草稿失败。' })
      )
    return true
  }

  // 先创建空白标签页并绑定唯一 tab ID，再导航，避免其他新对话误消费草稿。
  if (message?.type === 'OPEN_BRANCH_TAB') {
    const sourceTabId = sender.tab?.id
    const sourceUrl = sender.tab?.url
    try {
      if (typeof sourceTabId !== 'number' || !sourceUrl) {
        throw new Error('无法识别分支来源标签页。')
      }
      const targetUrl = new URL(String(message.url ?? ''), sourceUrl)
      const sourceOrigin = new URL(sourceUrl).origin
      if (!['http:', 'https:'].includes(targetUrl.protocol) || targetUrl.origin !== sourceOrigin) {
        throw new Error('分支目标地址无效。')
      }
      ;(async () => {
        const stored = await chrome.storage.local.get({ [STORAGE_KEYS.BRANCH_DRAFT]: null })
        const draft = (stored[STORAGE_KEYS.BRANCH_DRAFT] as BranchPromptDraft | null) ?? null
        if (!isFreshBranchDraft(draft) || draft.sourceTabId !== sourceTabId) {
          throw new Error('没有可绑定到当前页面的分支草稿。')
        }

        const tab = await chrome.tabs.create({
          url: 'about:blank',
          openerTabId: sourceTabId,
          active: false
        })
        if (typeof tab.id !== 'number') throw new Error('无法识别新建的分支标签页。')

        try {
          await chrome.storage.local.set({
            [STORAGE_KEYS.BRANCH_DRAFT]: { ...draft, targetTabId: tab.id }
          })
          await chrome.tabs.update(tab.id, { url: targetUrl.href, active: true })
          sendResponse({ ok: true, data: { tabId: tab.id } })
        } catch (error) {
          await clearBranchDraft()
          await chrome.tabs.remove(tab.id).catch(() => undefined)
          throw error
        }
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : '打开分支标签页失败。'
        })
      )
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : '分支目标地址无效。'
      })
      return false
    }
    return true
  }

  // 仅允许后台为本次分支显式绑定的目标标签页消费草稿。
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
        if (
          canTabConsumeBranchDraft(draft, currentTabId) ||
          canTabConsumeNativeGeminiDraft(draft, {
            tabId: currentTabId,
            openerTabId: sender.tab?.openerTabId,
            url: sender.tab?.url
          }) ||
          canTabConsumeNativeChatGptDraft(draft, {
            tabId: currentTabId,
            openerTabId: sender.tab?.openerTabId,
            url: sender.tab?.url
          })
        ) {
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
