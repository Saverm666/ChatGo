// 站点适配层：注册与匹配

import type { SiteAdapter } from '@/main/types'
import { chatgptAdapter } from './chatgpt'
import { deepseekAdapter } from './deepseek'
import { geminiAdapter } from './gemini'
import { nextchatAdapter } from './nextchat'
import { lobechatAdapter } from './lobechat'
import { genericAdapter } from './generic'

// 内置适配器（顺序即匹配优先级，generic 兜底放最后）
export const BUILTIN_ADAPTERS: SiteAdapter[] = [
  chatgptAdapter,
  deepseekAdapter,
  geminiAdapter,
  nextchatAdapter,
  lobechatAdapter,
  genericAdapter
]

// 按 URL 匹配适配器，命中第一个；都不命中则返回 generic
export function resolveAdapter(url: URL): SiteAdapter {
  for (const adapter of BUILTIN_ADAPTERS) {
    if (adapter.id === 'generic') continue
    try {
      if (adapter.match(url)) return adapter
    } catch {
      // 适配器匹配异常则跳过
    }
  }
  return genericAdapter
}

export type { SiteAdapter } from '@/main/types'
export { chatgptAdapter, deepseekAdapter, geminiAdapter, nextchatAdapter, lobechatAdapter, genericAdapter }
