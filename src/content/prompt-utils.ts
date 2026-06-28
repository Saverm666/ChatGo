import type { SavedPrompt } from '@/main/types'

export const ALL_PROMPT_CATEGORIES = '全部分类'

export const PROMPT_CATEGORIES = [
  '写作',
  '学术',
  '代码',
  '翻译',
  '总结',
  '问答',
  '其他'
] as const

export function normalizePromptTags(value: string): string[] {
  const seen = new Set<string>()
  const tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

  return tags.filter((tag) => {
    if (seen.has(tag)) return false
    seen.add(tag)
    return true
  }).slice(0, 6)
}

export function inferPromptCategory(prompt: Pick<SavedPrompt, 'name' | 'content'>): string {
  const text = `${prompt.name} ${prompt.content}`.toLowerCase()
  if (/代码|函数|调试|开发|debug|code|typescript|python|java/.test(text)) return '代码'
  if (/论文|学术|研究|paper|research|citation/.test(text)) return '学术'
  if (/翻译|英文|英语|translate|translation/.test(text)) return '翻译'
  if (/总结|摘要|归纳|summary|summarize/.test(text)) return '总结'
  if (/写作|润色|改写|文案|polish|rewrite/.test(text)) return '写作'
  if (/问答|解释|分析|回答/.test(text)) return '问答'
  return '其他'
}

export function getPromptCategory(prompt: SavedPrompt): string {
  return prompt.category?.trim() || inferPromptCategory(prompt)
}

export function sortPrompts(prompts: SavedPrompt[]): SavedPrompt[] {
  return [...prompts].sort((a, b) => {
    const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    if (pinned !== 0) return pinned
    const used = (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
    if (used !== 0) return used
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
}

export function filterPrompts(prompts: SavedPrompt[], keyword: string, category: string): SavedPrompt[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return prompts.filter((prompt) => {
    const promptCategory = getPromptCategory(prompt)
    if (category && category !== ALL_PROMPT_CATEGORIES && promptCategory !== category) return false
    if (!normalizedKeyword) return true
    return [prompt.name, prompt.content, promptCategory, ...(prompt.tags ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(normalizedKeyword)
  })
}

export function markPromptUsed(prompts: SavedPrompt[], id: string, timestamp = Date.now()): SavedPrompt[] {
  return prompts.map((prompt) => {
    if (prompt.id !== id) return prompt
    return {
      ...prompt,
      lastUsedAt: timestamp,
      usedCount: (prompt.usedCount ?? 0) + 1
    }
  })
}
