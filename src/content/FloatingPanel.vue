<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { CSSProperties } from 'vue'
import {
  ArrowLeft,
  Bookmark,
  Copy,
  Shield,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
  Zap
} from '@lucide/vue'
import CgConfirmDialog from '@/content/ui/CgConfirmDialog.vue'
import CgEmptyState from '@/content/ui/CgEmptyState.vue'
import CgPromptCard from '@/content/ui/CgPromptCard.vue'
import CgSelectMenu from '@/content/ui/CgSelectMenu.vue'
import type { ChatGoSettings, FormulaHistoryEntry, SavedPrompt, SiteAdapter } from '@/main/types'
import { FORMULA_COPY_FORMAT_LABELS } from '@/main/constants'
import { copyTextToClipboard, formatTimestamp } from '@/main/utils'
import {
  normalizeSiteHostname,
  sanitizeSiteList,
  shouldEnableForSite,
  SITE_ACTIVATION_MODE_LABELS,
  SUPPORTED_SITE_ITEMS
} from '@/main/site-policy'
import {
  getDefaultFloatingRatio,
  getPanelPosition,
  getPanelPlacement,
  getResponsivePanelSize,
  positionToRatio,
  ratioToPosition,
  type FloatingRatio,
  type PanelPlacement
} from '@/content/floating-geometry'
import {
  ALL_PROMPT_CATEGORIES,
  PROMPT_CATEGORIES,
  filterPrompts,
  getPromptCategory,
  markPromptUsed,
  sortPrompts
} from '@/content/prompt-utils'
import {
  readPrompts,
  readFormulaHistory,
  readSettings,
  readFloatingPosition,
  writePrompts,
  writeFloatingPosition,
  writeSettings,
  clearFormulaHistory,
  onStorageChanged
} from '@/main/storage'
import { editorBridge } from '@/content/editor-bridge'
import { renderFormulaPreview } from '@/content/markdown'
import { sendRuntimeMessage } from '@/main/messaging'

const props = defineProps<{
  adapter: SiteAdapter
}>()

const settings = ref<ChatGoSettings | null>(null)
const prompts = ref<SavedPrompt[]>([])
const history = ref<FormulaHistoryEntry[]>([])
const expanded = ref(false)
const dragging = ref(false)
const activePage = ref<'library' | 'sites'>('library')
const activeTab = ref<'prompts' | 'formula'>('prompts')
const promptSearch = ref('')
const promptCategoryFilter = ref(ALL_PROMPT_CATEGORIES)
const formulaSearch = ref('')
const ALL_FORMULA_SOURCES = '全部站点'
const formulaSourceFilter = ref(ALL_FORMULA_SOURCES)
const confirmDelete = ref<{ open: boolean; promptId: string; name: string }>({ open: false, promptId: '', name: '' })
const fabX = ref<number | null>(null)
const fabY = ref<number | null>(null)
const positionRatio = ref<FloatingRatio>(getDefaultFloatingRatio())
const statusMessage = ref('')
let statusTimer: number | null = null
let unsubStorage: (() => void) | null = null
let unsubBridge: (() => void) | null = null
let dragMoved = false

const FAB_SIZE = 52
const VIEWPORT_MARGIN = 8
const PANEL_GAP = 12
const PANEL_WIDTH = 360
const PANEL_HEIGHT_RATIO = 0.7
const PANEL_MIN_HEIGHT = 380
const PANEL_MAX_HEIGHT = 560

const siteName = computed(() => props.adapter?.name ?? '当前站点')
const currentHostname = computed(() => normalizeSiteHostname(window.location.hostname))
const currentOrigin = computed(() => window.location.origin)
const currentPathname = computed(() => window.location.pathname || '/')
const promptCategories = [ALL_PROMPT_CATEGORIES, ...PROMPT_CATEGORIES]
const whitelistSites = computed(() => sanitizeSiteList(settings.value?.siteWhitelist))
const blacklistSites = computed(() => sanitizeSiteList(settings.value?.siteBlacklist))
const currentSiteEnabled = computed(() => {
  if (!settings.value) return false
  return shouldEnableForSite(settings.value, props.adapter, new URL(window.location.href))
})
const currentSiteStatusText = computed(() => {
  return currentSiteEnabled.value ? '当前站点已启用' : '当前站点未启用'
})
const siteModeOptions = computed(() => {
  return (Object.entries(SITE_ACTIVATION_MODE_LABELS) as Array<[keyof typeof SITE_ACTIVATION_MODE_LABELS, string]>)
    .map(([value, label]) => ({ value, label }))
})
const formulaSourceOptions = computed(() => {
  const labels = new Set<string>()
  history.value.forEach((entry) => {
    labels.add(getFormulaSiteName(entry))
  })
  return [ALL_FORMULA_SOURCES, ...Array.from(labels).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
})
const sortedPrompts = computed(() => sortPrompts(prompts.value))
const filteredPrompts = computed(() => {
  return filterPrompts(sortedPrompts.value, promptSearch.value, promptCategoryFilter.value)
})
const filteredHistory = computed(() => {
  const keyword = formulaSearch.value.trim().toLowerCase()
  return history.value.filter((entry) => {
    const matchesSource = formulaSourceFilter.value === ALL_FORMULA_SOURCES
      || getFormulaSiteName(entry) === formulaSourceFilter.value
    if (!matchesSource) return false
    if (!keyword) return true
    return `${entry.text} ${entry.latexSource} ${entry.sourceTitle}`.toLowerCase().includes(keyword)
  })
})

function getFormulaSiteName(entry: FormulaHistoryEntry): string {
  try {
    const hostname = new URL(entry.sourceUrl).hostname.replace(/^www\./, '')
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'ChatGPT'
    if (hostname.includes('deepseek')) return 'DeepSeek'
    if (hostname.includes('gemini.google.com')) return 'Gemini'
    if (hostname.includes('lobechat')) return 'LobeChat'
    if (hostname.includes('nextchat') || hostname.includes('chatgpt-next-web')) return 'NextChat'
    return hostname || '未知站点'
  } catch {
    return '未知站点'
  }
}

function getFormulaRecordTitle(entry: FormulaHistoryEntry): string {
  const title = entry.sourceTitle?.trim()
  if (!title) return '公式记录'
  const siteName = getFormulaSiteName(entry).toLowerCase()
  const separators = [' - ', ' | ', ' · ', ' — ']

  for (const separator of separators) {
    const index = title.lastIndexOf(separator)
    if (index <= 0) continue
    const suffix = title.slice(index + separator.length).trim().toLowerCase()
    if (suffix.includes(siteName) || siteName.includes(suffix)) {
      return title.slice(0, index).trim() || title
    }
  }

  return title
}

function getViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function getPanelSize() {
  return getResponsivePanelSize(
    getViewport(),
    PANEL_WIDTH,
    PANEL_HEIGHT_RATIO,
    PANEL_MIN_HEIGHT,
    PANEL_MAX_HEIGHT,
    VIEWPORT_MARGIN
  )
}

function applyPositionFromRatio(): void {
  const next = ratioToPosition(positionRatio.value, getViewport(), FAB_SIZE, VIEWPORT_MARGIN)
  fabX.value = next.x
  fabY.value = next.y
}

function isStoredRatio(pos: unknown): pos is FloatingRatio {
  return Boolean(
    pos &&
      typeof pos === 'object' &&
      typeof (pos as FloatingRatio).xRatio === 'number' &&
      typeof (pos as FloatingRatio).yRatio === 'number'
  )
}

const panelPlacement = computed<PanelPlacement>(() => {
  if (fabX.value == null || fabY.value == null) return { horizontal: 'left', vertical: 'above', side: 'left' }
  return getPanelPlacement(
    { x: fabX.value, y: fabY.value },
    getViewport(),
    getPanelSize(),
    FAB_SIZE,
    PANEL_GAP
  )
})

const panelClass = computed(() => [
  `cg-panel--${panelPlacement.value.horizontal}`,
  `cg-panel--${panelPlacement.value.vertical}`
])

const fabStyle = computed<CSSProperties>(() => ({
  left: fabX.value != null ? `${fabX.value}px` : undefined,
  top: fabY.value != null ? `${fabY.value}px` : undefined
}))

const panelStyle = computed<CSSProperties>(() => ({
  ...getPanelStyle()
}))

function getPanelStyle(): CSSProperties {
  if (fabX.value == null || fabY.value == null) return {}
  const position = getPanelPosition(
    { x: fabX.value, y: fabY.value },
    getViewport(),
    getPanelSize(),
    FAB_SIZE,
    VIEWPORT_MARGIN,
    PANEL_GAP,
    panelPlacement.value
  )

  const style: CSSProperties = {
    height: `${position.maxHeight}px`,
    maxHeight: `${position.maxHeight}px`
  }
  if (position.left != null) {
    style.left = `${position.left}px`
  } else if (position.right != null) {
    style.right = `${position.right}px`
  }
  if (position.bottom != null) {
    style.bottom = `${position.bottom}px`
  } else if (position.top != null) {
    style.top = `${position.top}px`
  }

  return style
}

function setStatus(message: string): void {
  statusMessage.value = message
  if (statusTimer) window.clearTimeout(statusTimer)
  if (!message) {
    statusTimer = null
    return
  }
  statusTimer = window.setTimeout(() => {
    statusMessage.value = ''
    statusTimer = null
  }, 2000)
}

async function refreshData(): Promise<void> {
  const [s, p, h] = await Promise.all([readSettings(), readPrompts(), readFormulaHistory()])
  settings.value = s
  prompts.value = p
  history.value = h
}

async function loadPosition(): Promise<void> {
  const pos = await readFloatingPosition()
  if (isStoredRatio(pos)) {
    positionRatio.value = pos
  } else if (typeof pos?.x === 'number' && typeof pos?.y === 'number') {
    positionRatio.value = positionToRatio({ x: pos.x, y: pos.y }, getViewport(), FAB_SIZE, VIEWPORT_MARGIN)
    await writeFloatingPosition(positionRatio.value)
  } else {
    positionRatio.value = getDefaultFloatingRatio()
  }
  applyPositionFromRatio()
}

// 拖拽逻辑
let dragStartX = 0
let dragStartY = 0
let dragOffsetX = 0
let dragOffsetY = 0

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  dragging.value = true
  dragMoved = false
  dragStartX = event.clientX
  dragStartY = event.clientY
  if (fabX.value != null && fabY.value != null) {
    dragOffsetX = event.clientX - fabX.value
    dragOffsetY = event.clientY - fabY.value
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  const dx = Math.abs(event.clientX - dragStartX)
  const dy = Math.abs(event.clientY - dragStartY)
  if (dx > 4 || dy > 4) dragMoved = true
  const x = event.clientX - dragOffsetX
  const y = event.clientY - dragOffsetY
  const clamped = ratioToPosition(positionToRatio({ x, y }, getViewport(), FAB_SIZE, VIEWPORT_MARGIN), getViewport(), FAB_SIZE, VIEWPORT_MARGIN)
  fabX.value = clamped.x
  fabY.value = clamped.y
}

async function onPointerUp(): Promise<void> {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  dragging.value = false
  if (dragMoved && fabX.value != null && fabY.value != null) {
    positionRatio.value = positionToRatio(
      { x: fabX.value, y: fabY.value },
      getViewport(),
      FAB_SIZE,
      VIEWPORT_MARGIN
    )
    await writeFloatingPosition(positionRatio.value)
  } else if (!dragMoved) {
    expanded.value = !expanded.value
  }
}

function onResize(): void {
  applyPositionFromRatio()
}

function closePanel(): void {
  expanded.value = false
  activePage.value = 'library'
  confirmDelete.value = { open: false, promptId: '', name: '' }
}

function openSiteManager(): void {
  activePage.value = 'sites'
}

function closeSiteManager(): void {
  activePage.value = 'library'
}

function openSettings(): void {
  sendRuntimeMessage({ type: 'OPEN_OPTIONS_PAGE' }).then((response) => {
    if (!response.ok) setStatus(response.error || '打开设置页失败')
  })
}

function openNewPromptEditor(): void {
  editorBridge.open({
    editingPromptId: '',
    promptName: '',
    promptContent: '',
    promptCategory: '其他',
    promptTagsInput: ''
  })
}

function openEditPromptEditor(prompt: SavedPrompt): void {
  editorBridge.open({
    editingPromptId: prompt.id,
    promptName: prompt.name,
    promptContent: prompt.content,
    promptCategory: getPromptCategory(prompt),
    promptTagsInput: (prompt.tags ?? []).join('，')
  })
}

async function deletePrompt(id: string): Promise<void> {
  const list = await readPrompts()
  await writePrompts(list.filter((prompt) => prompt.id !== id))
  await refreshData()
  setStatus('已删除提示词')
}

function askDelete(promptId: string, name: string): void {
  confirmDelete.value = { open: true, promptId, name }
}

async function performDelete(): Promise<void> {
  const id = confirmDelete.value.promptId
  confirmDelete.value = { open: false, promptId: '', name: '' }
  if (id) await deletePrompt(id)
}

async function togglePromptPin(prompt: SavedPrompt): Promise<void> {
  const list = await readPrompts()
  await writePrompts(list.map((item) => (item.id === prompt.id ? { ...item, pinned: !item.pinned } : item)))
  await refreshData()
}

async function copyPrompt(prompt: SavedPrompt): Promise<void> {
  try {
    await copyTextToClipboard(prompt.content)
    await writePrompts(markPromptUsed(await readPrompts(), prompt.id))
    await refreshData()
    setStatus(`已复制「${prompt.name}」`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '复制失败')
  }
}

async function copyHistoryEntry(entry: FormulaHistoryEntry): Promise<void> {
  try {
    await copyTextToClipboard(entry.text)
    setStatus('已复制公式')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '复制失败')
  }
}

async function clearHistory(): Promise<void> {
  await clearFormulaHistory()
  history.value = []
  setStatus('已清空公式历史')
}

async function patchSettings(patch: Partial<ChatGoSettings>, message = ''): Promise<void> {
  await writeSettings(patch)
  await refreshData()
  if (message) setStatus(message)
}

async function setSiteActivationMode(mode: ChatGoSettings['siteActivationMode']): Promise<void> {
  await patchSettings({ siteActivationMode: mode }, '已更新默认站点模式')
}

async function addCurrentSiteToWhitelist(): Promise<void> {
  const hostname = currentHostname.value
  await patchSettings({
    siteWhitelist: Array.from(new Set([...whitelistSites.value, hostname])),
    siteBlacklist: blacklistSites.value.filter((item) => item !== hostname)
  }, '已加入白名单')
}

async function addCurrentSiteToBlacklist(): Promise<void> {
  const hostname = currentHostname.value
  await patchSettings({
    siteWhitelist: whitelistSites.value.filter((item) => item !== hostname),
    siteBlacklist: Array.from(new Set([...blacklistSites.value, hostname]))
  }, '已加入黑名单')
}

async function removeWhitelistSite(hostname: string): Promise<void> {
  await patchSettings({
    siteWhitelist: whitelistSites.value.filter((item) => item !== hostname)
  }, '已移出白名单')
}

async function removeBlacklistSite(hostname: string): Promise<void> {
  await patchSettings({
    siteBlacklist: blacklistSites.value.filter((item) => item !== hostname)
  }, '已移出黑名单')
}

function toggleCollapse(): void {
  const api = window.ChatGoCollapse
  if (!api) {
    setStatus('折叠功能未就绪')
    return
  }
  const state = api.getState()
  if (state.collapsedCount > 0) {
    api.restore()
    setStatus('已恢复隐藏消息')
  } else {
    const result = api.collapse()
    setStatus(result.message)
  }
}

const collapseStateText = computed(() => {
  const api = window.ChatGoCollapse
  if (!api) return ''
  const state = api.getState()
  return state.collapsedCount > 0 ? `已折叠 ${state.collapsedCount} 条 · 点击恢复` : '轻量对话'
})

onMounted(async () => {
  await Promise.all([refreshData(), loadPosition()])
  window.addEventListener('resize', onResize)
  unsubStorage = onStorageChanged((changes) => {
    const settingKeys = [
      'siteActivationMode',
      'siteWhitelist',
      'siteBlacklist',
      'formulaCopierEnabled',
      'formulaCopyFormat',
      'markdownCopyEnabled',
      'markdownFormulaWrapMode',
      'enterEnhancerEnabled',
      'collapseEnabled',
      'collapseKeepLatest',
      'branchEnabled',
      'floatingPanelEnabled'
    ]
    if (
      'chatgo_formula_history' in changes ||
      'chatgo_saved_prompts' in changes ||
      settingKeys.some((key) => key in changes)
    ) {
      refreshData().catch(() => {})
    }
  })
  unsubBridge = editorBridge.on(() => {
    refreshData().catch(() => {})
  })
})

onBeforeUnmount(() => {
  unsubStorage?.()
  unsubBridge?.()
  if (statusTimer) window.clearTimeout(statusTimer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div
    class="cg-fab"
    :class="{ 'cg-fab--dragging': dragging, 'cg-fab--expanded': expanded }"
  >
    <div v-if="expanded" class="cg-backdrop" @pointerdown="closePanel" />

    <button class="cg-fab__btn" type="button" aria-label="ChatGo" :style="fabStyle" @pointerdown.stop="onPointerDown">
      <svg class="cg-fab__logo" viewBox="120 120 260 260" aria-hidden="true">
        <path d="M 170,140 H 330 A 30,30 0 0 1 360,170 V 270 A 30,30 0 0 1 330,300 H 220 L 160,350 V 300 A 30,30 0 0 1 140,270 V 170 A 30,30 0 0 1 170,140 Z" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="185" y="185" width="130" height="30" rx="10" fill="#E8F4FF" />
        <rect x="185" y="230" width="90" height="30" rx="10" fill="#4BA3FF" />
      </svg>
    </button>

    <Transition name="cg-panel">
      <div v-if="expanded" class="cg-panel" :class="panelClass" :style="panelStyle" @pointerdown.stop>
        <header class="cg-panel__head">
          <div class="cg-panel__brand">
            <div class="cg-panel__mark">
              <svg viewBox="120 120 260 260" aria-hidden="true">
                <path d="M 170,140 H 330 A 30,30 0 0 1 360,170 V 270 A 30,30 0 0 1 330,300 H 220 L 160,350 V 300 A 30,30 0 0 1 140,270 V 170 A 30,30 0 0 1 170,140 Z" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
                <rect x="185" y="185" width="130" height="30" rx="10" fill="#E8F4FF" />
                <rect x="185" y="230" width="90" height="30" rx="10" fill="#4BA3FF" />
              </svg>
            </div>
            <div>
              <h1>ChatGo</h1>
              <span class="cg-panel__site">{{ siteName }}</span>
            </div>
          </div>

          <div class="cg-panel__head-actions">
            <button
              class="cg-panel__icon-action"
              type="button"
              :aria-label="collapseStateText || '轻量对话'"
              :title="collapseStateText || '轻量对话'"
              @click="toggleCollapse"
            >
              <Zap aria-hidden="true" :size="15" :stroke-width="2.4" />
            </button>
            <button
              class="cg-panel__icon-action"
              :class="{ 'cg-panel__icon-action--active': activePage === 'sites' }"
              type="button"
              aria-label="站点管理"
              title="站点管理"
              @click="openSiteManager"
            >
              <Shield aria-hidden="true" :size="16" :stroke-width="2" />
            </button>
            <button class="cg-panel__close" type="button" aria-label="打开设置" @click.stop="openSettings">
              <Settings aria-hidden="true" :size="18" :stroke-width="2" />
            </button>
            <button class="cg-panel__close" type="button" aria-label="关闭" @click.stop="closePanel">
              <X aria-hidden="true" :size="18" :stroke-width="2" />
            </button>
          </div>
        </header>

        <div class="cg-panel__body">
          <template v-if="activePage === 'library'">
            <nav class="cg-tabs" aria-label="悬浮窗功能">
              <button
                class="cg-tab"
                :class="{ 'cg-tab--active': activeTab === 'prompts' }"
                type="button"
                @click="activeTab = 'prompts'"
              >
                <Bookmark aria-hidden="true" :size="17" :stroke-width="2.2" />
                提示词
              </button>
              <button
                class="cg-tab"
                :class="{ 'cg-tab--active': activeTab === 'formula' }"
                type="button"
                @click="activeTab = 'formula'"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <text x="3.2" y="16.4" fill="currentColor" font-family="Georgia, 'Times New Roman', serif" font-size="14.5" font-weight="700">L</text>
                  <text x="9.7" y="10.1" fill="currentColor" font-family="Georgia, 'Times New Roman', serif" font-size="8" font-weight="700">A</text>
                  <circle cx="17.2" cy="15.9" r="6.4" fill="#FFFFFF" stroke="currentColor" stroke-width="1.75" />
                  <path d="M17.2 12.2 V15.9 L20.1 17.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                公式历史
              </button>
            </nav>

            <section v-if="activeTab === 'prompts'" class="cg-page">
              <div class="cg-toolbar">
                <label class="cg-search">
                  <Search aria-hidden="true" :size="16" :stroke-width="2" />
                  <input v-model="promptSearch" type="search" placeholder="搜索提示词" />
                </label>
                <CgSelectMenu v-model="promptCategoryFilter" :options="promptCategories" label="筛选分类" />
                <button class="cg-new-btn cg-new-btn--icon" type="button" aria-label="新建提示词" title="新建提示词" @click="openNewPromptEditor">
                  <Plus aria-hidden="true" :size="17" :stroke-width="2.2" />
                </button>
              </div>

              <CgEmptyState v-if="prompts.length === 0">还没有保存的提示词</CgEmptyState>
              <CgEmptyState v-else-if="filteredPrompts.length === 0" compact>没有匹配的提示词</CgEmptyState>
              <ul v-else class="cg-card-list">
                <CgPromptCard
                  v-for="p in filteredPrompts"
                  :key="p.id"
                  :prompt="p"
                  :category="getPromptCategory(p)"
                  @pin="togglePromptPin(p)"
                  @copy="copyPrompt(p)"
                  @edit="openEditPromptEditor(p)"
                  @delete="askDelete(p.id, p.name || '未命名')"
                />
              </ul>
            </section>

            <section v-else class="cg-page">
              <div class="cg-toolbar">
                <label class="cg-search">
                  <Search aria-hidden="true" :size="16" :stroke-width="2" />
                  <input v-model="formulaSearch" type="search" placeholder="搜索公式记录" />
                </label>
                <CgSelectMenu v-model="formulaSourceFilter" :options="formulaSourceOptions" label="筛选网站来源" />
                <button
                  class="cg-clear-btn cg-clear-btn--icon"
                  type="button"
                  :disabled="history.length === 0"
                  aria-label="清空记录"
                  title="清空记录"
                  @click="clearHistory"
                >
                  <Trash2 aria-hidden="true" :size="15" :stroke-width="2" />
                </button>
              </div>

              <CgEmptyState v-if="history.length === 0">还没有复制记录</CgEmptyState>
              <CgEmptyState v-else-if="filteredHistory.length === 0" compact>没有匹配的公式记录</CgEmptyState>
              <ol v-else class="cg-formula-list">
                <li v-for="(h, i) in filteredHistory" :key="`${h.copiedAt}-${i}`" class="cg-formula-card">
                  <div class="cg-formula-card__head">
                    <div class="cg-formula-card__title">
                      <span class="cg-formula-card__index">{{ i + 1 }}</span>
                      <h3>{{ getFormulaRecordTitle(h) }}</h3>
                    </div>
                    <button class="cg-copy-btn" type="button" @click="copyHistoryEntry(h)">
                      <Copy aria-hidden="true" :size="15" :stroke-width="2" />
                      复制
                    </button>
                  </div>
                  <div class="cg-formula-card__formula" v-html="renderFormulaPreview(h.latexSource || h.text)" />
                  <div class="cg-formula-card__meta">
                    <span>{{ formatTimestamp(h.copiedAt) || '刚刚' }}</span>
                    <span>{{ getFormulaSiteName(h) }}</span>
                    <span>{{ FORMULA_COPY_FORMAT_LABELS[h.format] }}</span>
                  </div>
                </li>
              </ol>
            </section>
          </template>

          <section v-else class="cg-page cg-site-page">
            <div class="cg-site-page__topbar">
              <button class="cg-ghost-btn cg-ghost-btn--icon" type="button" aria-label="返回" title="返回" @click="closeSiteManager">
                <ArrowLeft aria-hidden="true" :size="16" :stroke-width="2.2" />
              </button>
              <div class="cg-site-page__title">
                <h2>站点管理</h2>
                <p>{{ currentSiteStatusText }}</p>
              </div>
            </div>

            <div class="cg-site-stack">
              <section class="cg-site-card">
                <div class="cg-site-card__head">
                  <h3>当前站点</h3>
                  <span class="cg-site-badge" :class="{ 'cg-site-badge--muted': !currentSiteEnabled }">
                    {{ currentSiteEnabled ? '已启用' : '未启用' }}
                  </span>
                </div>
                <dl class="cg-site-info">
                  <div>
                    <dt>站点</dt>
                    <dd>{{ currentHostname }}</dd>
                  </div>
                  <div>
                    <dt>适配器</dt>
                    <dd>{{ siteName }}</dd>
                  </div>
                  <div>
                    <dt>页面</dt>
                    <dd>{{ currentOrigin }}{{ currentPathname }}</dd>
                  </div>
                </dl>
              </section>

              <section class="cg-site-card">
                <div class="cg-site-card__head">
                  <h3>默认模式</h3>
                </div>
                <div class="cg-site-mode-list">
                  <button
                    v-for="option in siteModeOptions"
                    :key="option.value"
                    class="cg-site-mode"
                    :class="{ 'cg-site-mode--active': settings?.siteActivationMode === option.value }"
                    type="button"
                    @click="setSiteActivationMode(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </section>

              <section class="cg-site-card">
                <div class="cg-site-card__head">
                  <h3>支持的页面</h3>
                </div>
                <ul class="cg-site-supported">
                  <li v-for="item in SUPPORTED_SITE_ITEMS" :key="item.id">
                    <strong>{{ item.name }}</strong>
                    <span>{{ item.pages }}</span>
                  </li>
                </ul>
              </section>

              <section class="cg-site-card">
                <div class="cg-site-card__head">
                  <h3>白名单站点</h3>
                  <button class="cg-secondary-btn" type="button" @click="addCurrentSiteToWhitelist">添加当前站点</button>
                </div>
                <div v-if="whitelistSites.length" class="cg-site-chip-list">
                  <button v-for="hostname in whitelistSites" :key="hostname" class="cg-site-chip" type="button" @click="removeWhitelistSite(hostname)">
                    <span>{{ hostname }}</span>
                    <X aria-hidden="true" :size="13" :stroke-width="2.3" />
                  </button>
                </div>
                <CgEmptyState v-else compact>还没有白名单站点</CgEmptyState>
              </section>

              <section class="cg-site-card">
                <div class="cg-site-card__head">
                  <h3>黑名单站点</h3>
                  <button class="cg-secondary-btn cg-secondary-btn--danger" type="button" @click="addCurrentSiteToBlacklist">添加当前站点</button>
                </div>
                <div v-if="blacklistSites.length" class="cg-site-chip-list">
                  <button v-for="hostname in blacklistSites" :key="hostname" class="cg-site-chip cg-site-chip--danger" type="button" @click="removeBlacklistSite(hostname)">
                    <span>{{ hostname }}</span>
                    <X aria-hidden="true" :size="13" :stroke-width="2.3" />
                  </button>
                </div>
                <CgEmptyState v-else compact>还没有黑名单站点</CgEmptyState>
              </section>
            </div>
          </section>
        </div>

        <footer v-if="statusMessage" class="cg-panel__foot">
          <span class="cg-status-dot" />
          {{ statusMessage }}
        </footer>

        <CgConfirmDialog
          v-if="confirmDelete.open"
          open
          title="删除提示词"
          :message="`确认删除「${confirmDelete.name}」？此操作不可撤销。`"
          confirm-label="确认删除"
          danger
          @cancel="confirmDelete = { open: false, promptId: '', name: '' }"
          @confirm="performDelete()"
        />
      </div>
    </Transition>
  </div>
</template>
