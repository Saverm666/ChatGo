import type { ChatGoSettings, SiteActivationMode, SiteAdapter } from './types'

export interface SupportedSiteItem {
  id: string
  name: string
  hostname: string
  pages: string
}

export const SITE_ACTIVATION_MODE_LABELS: Record<SiteActivationMode, string> = {
  'common-ai-only': '默认只在四个内置站点启用',
  'all-sites': '默认在已授权站点启用',
  disabled: '默认全都不启用'
}

export const SUPPORTED_SITE_ITEMS: SupportedSiteItem[] = [
  { id: 'chatgpt', name: 'ChatGPT', hostname: 'chatgpt.com', pages: 'chatgpt.com' },
  { id: 'deepseek', name: 'DeepSeek', hostname: 'chat.deepseek.com', pages: 'chat.deepseek.com' },
  { id: 'gemini', name: 'Gemini', hostname: 'gemini.google.com', pages: 'gemini.google.com' },
  { id: 'qwen', name: 'Qwen', hostname: 'chat.qwen.ai', pages: 'chat.qwen.ai' }
]

const COMMON_AI_ADAPTER_IDS = new Set(SUPPORTED_SITE_ITEMS.map((site) => site.id))
const SUPPORTED_SITE_HOSTNAMES = new Set(SUPPORTED_SITE_ITEMS.map((site) => site.hostname))

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
  return COMMON_AI_ADAPTER_IDS.has(adapter.id)
}

export function isSupportedSiteHostname(hostname: string): boolean {
  return SUPPORTED_SITE_HOSTNAMES.has(normalizeSiteHostname(hostname))
}

export function shouldEnableForSite(
  settings: ChatGoSettings,
  adapter: SiteAdapter,
  url: URL
): boolean {
  const hostname = normalizeSiteHostname(url.hostname)
  if (!isSupportedSiteHostname(hostname)) return false

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
