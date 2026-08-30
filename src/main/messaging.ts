// 跨上下文消息通道：content ↔ background

import { isExtensionContextInvalidatedError } from './storage'

// 消息类型
export type RuntimeMessage =
  | { type: 'OPEN_OPTIONS_PAGE' }
  | {
      type: 'CREATE_BRANCH_DRAFT'
      draft: Omit<import('./types').BranchPromptDraft, 'sourceTabId' | 'targetTabId'>
    }
  | { type: 'OPEN_BRANCH_TAB'; url: string }
  | { type: 'CONSUME_BRANCH_DRAFT' }
  | { type: 'CLEAR_BRANCH_DRAFT' }
  | { type: 'GET_PAGE_INFO' }

export type RuntimeResponse<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

// 发送运行时消息（带扩展上下文失效检测）
export async function sendRuntimeMessage<T = unknown>(
  message: RuntimeMessage
): Promise<RuntimeResponse<T>> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>
    return response ?? { ok: false, error: '无响应' }
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return { ok: false, error: '扩展上下文已失效，请刷新页面。' }
    }
    return { ok: false, error: error instanceof Error ? error.message : '扩展通信失败。' }
  }
}

// 响应运行时消息的辅助：返回 Promise 形式
export function replyOk<T>(data?: T): RuntimeResponse<T> {
  return { ok: true, data }
}

export function replyError(error: string): RuntimeResponse<never> {
  return { ok: false, error }
}
