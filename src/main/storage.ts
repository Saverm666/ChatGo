// chrome.storage 封装：统一读写 + 类型安全

import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants'
import type {
  BranchPromptDraft,
  ChatGoSettings,
  FormulaHistoryEntry,
  FloatingPanelPosition,
  PromptDraft,
  SavedPrompt
} from './types'

// 扩展上下文失效检测
export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.includes('Extension context invalidated')
}

// 读取全部设置（合并默认值）
export async function readSettings(): Promise<ChatGoSettings> {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS, ...stored }
}

// 写入部分设置
export async function writeSettings(patch: Partial<ChatGoSettings>): Promise<void> {
  const current = await readSettings()
  await chrome.storage.local.set({ ...current, ...patch })
}

// 读取公式历史
export async function readFormulaHistory(): Promise<FormulaHistoryEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FORMULA_HISTORY)
  const history = result[STORAGE_KEYS.FORMULA_HISTORY]
  return Array.isArray(history) ? history : []
}

// 追加一条公式历史（自动截断到上限）
export async function appendFormulaHistory(
  entry: FormulaHistoryEntry,
  maxItems = 30
): Promise<void> {
  const history = await readFormulaHistory()
  const next = [entry, ...history].slice(0, maxItems)
  await chrome.storage.local.set({ [STORAGE_KEYS.FORMULA_HISTORY]: next })
}

// 清空公式历史
export async function clearFormulaHistory(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.FORMULA_HISTORY]: [] })
}

// 读取提示词列表
export async function readPrompts(): Promise<SavedPrompt[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SAVED_PROMPTS)
  const prompts = result[STORAGE_KEYS.SAVED_PROMPTS]
  return Array.isArray(prompts) ? prompts : []
}

// 写入提示词列表
export async function writePrompts(prompts: SavedPrompt[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SAVED_PROMPTS]: prompts })
}

// 读取分支草稿
export async function readBranchDraft(): Promise<BranchPromptDraft | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BRANCH_DRAFT)
  return (result[STORAGE_KEYS.BRANCH_DRAFT] as BranchPromptDraft | null) ?? null
}

// 写入分支草稿
export async function writeBranchDraft(draft: BranchPromptDraft | null): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.BRANCH_DRAFT]: draft })
}

// 读取所有提示词草稿
export async function readPromptDrafts(): Promise<Record<string, PromptDraft>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROMPT_DRAFTS)
  const drafts = result[STORAGE_KEYS.PROMPT_DRAFTS]
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) return {}
  return drafts as Record<string, PromptDraft>
}

// 写入单条提示词草稿
export async function writePromptDraft(draft: PromptDraft): Promise<void> {
  const all = await readPromptDrafts()
  all[draft.key] = { ...draft, updatedAt: Date.now() }
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_DRAFTS]: all })
}

// 清除单条提示词草稿
export async function clearPromptDraft(key: string): Promise<void> {
  const all = await readPromptDrafts()
  if (!(key in all)) return
  delete all[key]
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_DRAFTS]: all })
}

// 批量清除提示词草稿（一次读写，用于清理旧版残留 key）
export async function clearPromptDraftsByKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const all = await readPromptDrafts()
  let changed = false
  for (const k of keys) {
    if (k in all) {
      delete all[k]
      changed = true
    }
  }
  if (changed) await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_DRAFTS]: all })
}

// 读取悬浮窗位置
export async function readFloatingPosition(): Promise<FloatingPanelPosition | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FLOATING_POSITION)
  return (result[STORAGE_KEYS.FLOATING_POSITION] as FloatingPanelPosition | null) ?? null
}

// 写入悬浮窗位置
export async function writeFloatingPosition(pos: FloatingPanelPosition): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.FLOATING_POSITION]: pos })
}

// 监听存储变化（带取消）
export function onStorageChanged(
  callback: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => callback(changes, area)
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
