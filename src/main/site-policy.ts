import type { ChatGoSettings, SiteActivationMode, SiteAdapter } from './types'

export interface SupportedSiteItem {
  id: string
  name: string
  pages: string
}

export const SITE_ACTIVATION_MODE_LABELS: Record<SiteActivationMode, string> = {
  'common-ai-only': '默认只在常见 AI 站点启用',
  'all-sites': '默认全部站点启用',
  disabled: '默认全都不启用'
}

export const SUPPORTED_SITE_ITEMS: SupportedSiteItem[] = [
  { id: 'chatgpt', name: 'ChatGPT', pages: 'chatgpt.com / chat.openai.com' },
  { id: 'deepseek', name: 'DeepSeek', pages: 'deepseek.com 对话页' },
  { id: 'gemini', name: 'Gemini', pages: 'gemini.google.com 相关页面' },
  { id: 'nextchat', name: 'NextChat', pages: 'NextChat / ChatGPT-Next-Web 常见对话页' },
  { id: 'lobechat', name: 'LobeChat', pages: 'LobeChat 常见对话页' },
  { id: 'generic', name: '通用启发式适配', pages: '其他具备聊天结构的站点' }
]

export function normalizeSiteHostname(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

export function sanitizeSiteList(list: string[] | undefined | null): string[] {
  if (!Array.isArray(list)) return []
  return Array.from(
    new Set(
      list
        .map((item) => normalizeSiteHostname(item))
        .filter(Boolean)
    )
  )
}

export function isCommonAiAdapter(adapter: SiteAdapter): boolean {
  return adapter.id !== 'generic'
}

export function shouldEnableForSite(
  settings: ChatGoSettings,
  adapter: SiteAdapter,
  url: URL
): boolean {
  const hostname = normalizeSiteHostname(url.hostname)
  const whitelist = sanitizeSiteList(settings.siteWhitelist)
  const blacklist = sanitizeSiteList(settings.siteBlacklist)

  if (blacklist.includes(hostname)) return false
  if (whitelist.includes(hostname)) return true

  switch (settings.siteActivationMode) {
    case 'all-sites':
      return true
    case 'disabled':
      return false
    case 'common-ai-only':
    default:
      return isCommonAiAdapter(adapter)
  }
}
