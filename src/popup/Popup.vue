<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ArrowUpRight, ChevronRight, Settings2 } from '@lucide/vue'
import type { ChatGoSettings, FormulaHistoryEntry, SavedPrompt } from '@/main/types'
import {
  FORMULA_COPY_FORMAT_LABELS,
  MARKDOWN_FORMULA_WRAP_LABELS
} from '@/main/constants'
import {
  SITE_ACTIVATION_MODE_LABELS,
  normalizeSiteHostname,
  sanitizeSiteList
} from '@/main/site-policy'
import { copyTextToClipboard, formatTimestamp, truncateText } from '@/main/utils'
import {
  readSettings,
  writeSettings,
  readPrompts,
  readFormulaHistory
} from '@/main/storage'
import { sendRuntimeMessage } from '@/main/messaging'
import ToggleRow from '@/components/ToggleRow.vue'
import RadioRow from '@/components/RadioRow.vue'

const pageTitle = ref('读取中…')
const pageUrl = ref('')
const adapterName = ref<string | null>(null)
const settings = ref<ChatGoSettings | null>(null)
const prompts = ref<SavedPrompt[]>([])
const history = ref<FormulaHistoryEntry[]>([])
const status = ref('')
const activeTab = ref<'features' | 'formats' | 'library'>('features')

function setStatus(message: string): void {
  status.value = message
  window.setTimeout(() => {
    if (status.value === message) status.value = ''
  }, 2000)
}

async function loadPageInfo(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    pageTitle.value = tab?.title ?? '未读取到标题'
    pageUrl.value = tab?.url ?? ''
    if (tab?.id) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' })
        if (response?.ok) adapterName.value = response.adapterName
      } catch {
        adapterName.value = null
      }
    }
  } catch {
    // 忽略
  }
}

async function loadData(): Promise<void> {
  const [s, p, h] = await Promise.all([readSettings(), readPrompts(), readFormulaHistory()])
  settings.value = s
  prompts.value = p
  history.value = h
}

async function update<K extends keyof ChatGoSettings>(key: K, value: ChatGoSettings[K]): Promise<void> {
  if (!settings.value) return
  ;(settings.value as Record<string, unknown>)[key] = value
  await writeSettings({ [key]: value } as Partial<ChatGoSettings>)
}

async function copyPrompt(prompt: SavedPrompt): Promise<void> {
  try {
    await copyTextToClipboard(prompt.content)
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

async function openOptions(): Promise<void> {
  const result = await sendRuntimeMessage({ type: 'OPEN_OPTIONS_PAGE' })
  if (!result.ok) setStatus(result.error)
}

const sortedPrompts = computed(() =>
  [...prompts.value].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
)
const currentHostname = computed(() => {
  try {
    return normalizeSiteHostname(new URL(pageUrl.value).hostname)
  } catch {
    return ''
  }
})
const whitelistSites = computed(() => sanitizeSiteList(settings.value?.siteWhitelist))
const blacklistSites = computed(() => sanitizeSiteList(settings.value?.siteBlacklist))
const currentSiteInWhitelist = computed(() => whitelistSites.value.includes(currentHostname.value))
const currentSiteInBlacklist = computed(() => blacklistSites.value.includes(currentHostname.value))
const siteModeOptions = computed(() => {
  return Object.entries(SITE_ACTIVATION_MODE_LABELS).map(([value, label]) => ({ value, label }))
})
const currentSiteStatusText = computed(() => {
  if (!currentHostname.value) return '无法识别当前站点'
  if (currentSiteInBlacklist.value) return '当前站点已停用'
  if (currentSiteInWhitelist.value) return '当前站点已强制启用'
  return '当前站点跟随默认模式'
})

async function enableCurrentSite(): Promise<void> {
  if (!settings.value || !currentHostname.value) return
  const hostname = currentHostname.value
  const nextWhitelist = Array.from(new Set([...whitelistSites.value, hostname]))
  const nextBlacklist = blacklistSites.value.filter((item) => item !== hostname)
  settings.value.siteWhitelist = nextWhitelist
  settings.value.siteBlacklist = nextBlacklist
  await writeSettings({ siteWhitelist: nextWhitelist, siteBlacklist: nextBlacklist })
  setStatus('已启用当前站点')
}

async function disableCurrentSite(): Promise<void> {
  if (!settings.value || !currentHostname.value) return
  const hostname = currentHostname.value
  const nextWhitelist = whitelistSites.value.filter((item) => item !== hostname)
  const nextBlacklist = Array.from(new Set([...blacklistSites.value, hostname]))
  settings.value.siteWhitelist = nextWhitelist
  settings.value.siteBlacklist = nextBlacklist
  await writeSettings({ siteWhitelist: nextWhitelist, siteBlacklist: nextBlacklist })
  setStatus('已停用当前站点')
}

onMounted(async () => {
  await Promise.all([loadPageInfo(), loadData()])
})
</script>

<template>
  <main class="popup">
    <header class="head">
      <div class="head__mark" aria-hidden="true">
        <svg viewBox="120 120 260 260">
          <path d="M 170,140 H 330 A 30,30 0 0 1 360,170 V 270 A 30,30 0 0 1 330,300 H 220 L 160,350 V 300 A 30,30 0 0 1 140,270 V 170 A 30,30 0 0 1 170,140 Z" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
          <rect x="185" y="185" width="130" height="30" rx="10" fill="#E8F4FF" />
          <rect x="185" y="230" width="90" height="30" rx="10" fill="#4BA3FF" />
        </svg>
      </div>
      <div class="head__identity">
        <h1>ChatGo</h1>
        <p>{{ adapterName || '聊天效率工具' }}</p>
      </div>
      <button class="head__settings" type="button" aria-label="打开完整设置" title="打开完整设置" @click="openOptions">
        <Settings2 aria-hidden="true" :size="18" :stroke-width="1.9" />
      </button>
    </header>

    <section v-if="settings" class="site-panel" aria-label="当前站点">
      <div class="site-panel__info">
        <span class="eyebrow">当前站点</span>
        <strong :title="currentHostname">{{ currentHostname || '未知站点' }}</strong>
        <span class="site-panel__status"><i aria-hidden="true" />{{ currentSiteStatusText }}</span>
      </div>
      <div class="site-panel__actions">
        <button type="button" :disabled="!currentHostname" :class="{ 'is-selected': currentSiteInWhitelist }" @click="enableCurrentSite">启用</button>
        <button type="button" :disabled="!currentHostname" :class="{ 'is-selected is-danger': currentSiteInBlacklist }" @click="disableCurrentSite">停用</button>
      </div>
    </section>

    <nav class="tabs" aria-label="弹窗内容">
      <button type="button" :aria-pressed="activeTab === 'features'" :class="{ 'is-active': activeTab === 'features' }" @click="activeTab = 'features'">功能</button>
      <button type="button" :aria-pressed="activeTab === 'formats'" :class="{ 'is-active': activeTab === 'formats' }" @click="activeTab = 'formats'">格式</button>
      <button type="button" :aria-pressed="activeTab === 'library'" :class="{ 'is-active': activeTab === 'library' }" @click="activeTab = 'library'">收藏</button>
    </nav>

    <div v-if="settings" :key="activeTab" class="content">
      <section v-if="activeTab === 'features'" class="pane" aria-label="功能开关">
        <div class="section-head">
          <div><span class="eyebrow">01 / FEATURES</span><h2>功能开关</h2></div>
          <span class="section-head__note">即改即用</span>
        </div>
        <div class="toggle-list">
          <ToggleRow v-model="settings.formulaCopierEnabled" label="公式点击复制" hint="点击公式即可按设定格式复制" @update:model-value="update('formulaCopierEnabled', $event)" />
          <ToggleRow v-model="settings.markdownCopyEnabled" label="选区复制为 Markdown" hint="保留标题、列表、代码和公式结构" @update:model-value="update('markdownCopyEnabled', $event)" />
          <ToggleRow v-model="settings.enterEnhancerEnabled" label="Enter / Ctrl+Enter" hint="Enter 换行，Ctrl+Enter 发送" @update:model-value="update('enterEnhancerEnabled', $event)" />
          <ToggleRow v-model="settings.branchEnabled" label="分支提问" hint="选区转引用，在新对话中继续" @update:model-value="update('branchEnabled', $event)" />
          <ToggleRow v-model="settings.conversationNavigatorEnabled" label="对话节点导航" hint="快速跳转提问，官方目录出现时隐藏" @update:model-value="update('conversationNavigatorEnabled', $event)" />
          <ToggleRow v-model="settings.floatingPanelEnabled" label="悬浮窗" hint="在页面显示可拖动入口" @update:model-value="update('floatingPanelEnabled', $event)" />
        </div>
      </section>

      <section v-else-if="activeTab === 'formats'" class="pane" aria-label="格式与站点模式">
        <div class="section-head"><div><span class="eyebrow">02 / PREFERENCES</span><h2>复制与站点</h2></div></div>
        <div class="option-group">
          <h3>公式复制格式</h3>
          <RadioRow v-model="settings.formulaCopyFormat" name="formula-format" :options="[
            { value: 'latex', label: FORMULA_COPY_FORMAT_LABELS.latex },
            { value: 'unicode-math', label: FORMULA_COPY_FORMAT_LABELS['unicode-math'] },
            { value: 'latex-source', label: FORMULA_COPY_FORMAT_LABELS['latex-source'] }
          ]" @update:model-value="update('formulaCopyFormat', $event as ChatGoSettings['formulaCopyFormat'])" />
        </div>
        <div class="option-group">
          <h3>Markdown 中的公式</h3>
          <RadioRow v-model="settings.markdownFormulaWrapMode" name="wrap-mode" :options="[
            { value: 'with-delimiters', label: MARKDOWN_FORMULA_WRAP_LABELS['with-delimiters'] },
            { value: 'bare', label: MARKDOWN_FORMULA_WRAP_LABELS.bare }
          ]" @update:model-value="update('markdownFormulaWrapMode', $event as ChatGoSettings['markdownFormulaWrapMode'])" />
        </div>
        <div class="option-group">
          <h3>默认站点模式</h3>
          <RadioRow v-model="settings.siteActivationMode" name="site-mode" :options="siteModeOptions" @update:model-value="update('siteActivationMode', $event as ChatGoSettings['siteActivationMode'])" />
        </div>
      </section>

      <section v-else class="pane" aria-label="收藏与历史">
        <div class="section-head"><div><span class="eyebrow">03 / LIBRARY</span><h2>随手取用</h2></div></div>
        <div class="library-group">
          <div class="library-group__head"><h3>提示词</h3><span>{{ prompts.length }} 条</span></div>
          <p v-if="sortedPrompts.length === 0" class="empty">还没有保存提示词</p>
          <ul v-else class="list">
            <li v-for="p in sortedPrompts.slice(0, 6)" :key="p.id">
              <button class="item" type="button" @click="copyPrompt(p)">
                <span class="item__text"><strong>{{ p.pinned ? '★ ' : '' }}{{ p.name || '未命名' }}</strong><small>{{ truncateText(p.content, 42) }}</small></span>
                <ChevronRight aria-hidden="true" :size="15" :stroke-width="2" />
              </button>
            </li>
          </ul>
        </div>
        <div class="library-group">
          <div class="library-group__head"><h3>公式历史</h3><span>{{ history.length }} 条</span></div>
          <p v-if="history.length === 0" class="empty">还没有复制记录</p>
          <ul v-else class="list">
            <li v-for="(h, i) in history.slice(0, 6)" :key="i">
              <button class="item" type="button" @click="copyHistoryEntry(h)">
                <span class="item__text"><strong>{{ FORMULA_COPY_FORMAT_LABELS[h.format] }}</strong><small>{{ formatTimestamp(h.copiedAt) }} · {{ truncateText(h.latexSource || h.text, 32) }}</small></span>
                <ChevronRight aria-hidden="true" :size="15" :stroke-width="2" />
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <footer class="foot">
      <button type="button" @click="openOptions">打开完整设置 <ArrowUpRight aria-hidden="true" :size="14" :stroke-width="2" /></button>
      <span>ChatGo · {{ adapterName || '多站点' }}</span>
    </footer>
    <p v-if="status" class="toast" role="status" aria-live="polite">{{ status }}</p>
  </main>
</template>

<style scoped>
.popup {
  width: 360px;
  max-height: 580px;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #111827;
  font-family: var(--cg-font-body);
  position: relative;
}
.head {
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid #e9edf4;
}
.head__mark { width: 36px; height: 36px; flex: 0 0 36px; }
.head__mark svg { display: block; width: 100%; height: 100%; }
.head__identity { min-width: 0; flex: 1; }
.head h1 { margin: 0; font: 700 20px/1.1 var(--cg-font-display); letter-spacing: -0.035em; }
.head__identity p { margin: 4px 0 0; color: #778296; font-size: 11px; line-height: 1.1; }
.head__settings {
  width: 32px; height: 32px; border: 1px solid #e5eaf2; border-radius: 10px;
  background: #fff; color: #536174; display: grid; place-items: center; cursor: pointer;
}
.head__settings:hover { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
.site-panel {
  margin: 12px 16px 0;
  padding: 12px 13px;
  min-height: 86px;
  border: 1px solid #dbe7f7;
  border-radius: 14px;
  background: #f4f8ff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.site-panel__info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.eyebrow { font: 700 10px/1.2 var(--cg-font-mono); letter-spacing: 0.08em; color: #6d86ae; }
.site-panel__info strong { font-size: 14px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.site-panel__status { color: #68778e; font-size: 10px; line-height: 1.3; white-space: nowrap; }
.site-panel__status i { display: inline-block; width: 5px; height: 5px; margin-right: 5px; border-radius: 50%; background: #3b82f6; vertical-align: 2px; }
.site-panel__actions { display: flex; flex: 0 0 auto; gap: 4px; padding: 3px; border: 1px solid #dbe7f7; border-radius: 10px; background: #fff; }
.site-panel__actions button { min-width: 40px; height: 29px; border: 0; border-radius: 7px; background: transparent; color: #657287; font-size: 11px; font-weight: 700; cursor: pointer; }
.site-panel__actions button:hover { background: #f1f6ff; color: #2563eb; }
.site-panel__actions button.is-selected { background: #eaf2ff; color: #1d4ed8; }
.site-panel__actions button.is-danger { background: #fff0f0; color: #c33131; }
.site-panel__actions button:disabled { opacity: .45; cursor: not-allowed; }
.tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 12px 16px 0; padding: 4px; border-radius: 11px; background: #f2f5f9; }
.tabs button { height: 31px; border: 0; border-radius: 8px; background: transparent; color: #778296; font-size: 12px; font-weight: 700; cursor: pointer; }
.tabs button:hover { color: #2563eb; }
.tabs button.is-active { color: #1d4ed8; background: #fff; box-shadow: 0 1px 3px rgba(26, 54, 93, .10); }
.content { min-height: 0; flex: 1; overflow-y: auto; padding: 15px 20px 10px; scrollbar-width: thin; scrollbar-color: #c8d6ea transparent; }
.pane { display: flex; flex-direction: column; }
.section-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 10px; }
.section-head h2 { margin: 3px 0 0; font: 700 18px/1.2 var(--cg-font-display); letter-spacing: -0.02em; }
.section-head__note { color: #8792a3; font-size: 11px; }
.toggle-list { display: flex; flex-direction: column; }
.toggle-list :deep(.cg-toggle) { padding: 11px 0; border-bottom: 1px solid #edf0f5; }
.toggle-list :deep(.cg-toggle:last-child) { border-bottom: 0; }
.toggle-list :deep(.cg-toggle__text strong) { font-size: 13px; font-weight: 650; }
.toggle-list :deep(.cg-toggle__text small) { font-size: 10.5px; line-height: 1.4; color: #8290a2; }
.toggle-list :deep(.cg-toggle__track) { width: 38px; height: 22px; }
.toggle-list :deep(.cg-toggle__thumb) { width: 18px; height: 18px; }
.toggle-list :deep(.cg-toggle__track--on .cg-toggle__thumb) { transform: translateX(16px); }
.option-group { padding: 12px 0 15px; border-bottom: 1px solid #edf0f5; }
.option-group:first-of-type { padding-top: 3px; }
.option-group:last-child { border-bottom: 0; }
.option-group h3, .library-group__head h3 { margin: 0 0 8px; font-size: 12px; font-weight: 750; color: #253247; }
.option-group :deep(.cg-radio-group) { padding-left: 0; gap: 5px; }
.option-group :deep(.cg-radio) { min-height: 35px; padding: 7px 10px; border: 1px solid transparent; border-radius: 8px; }
.option-group :deep(.cg-radio--checked) { background: #eff6ff; border-color: #d8e9ff; }
.option-group :deep(.cg-radio__label) { font-size: 12px; }
.option-group :deep(.cg-radio__check) { width: 16px; height: 16px; }
.option-group :deep(.cg-radio__check::after) { width: 7px; height: 7px; }
.library-group { padding: 4px 0 14px; }
.library-group + .library-group { border-top: 1px solid #edf0f5; padding-top: 16px; }
.library-group__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
.library-group__head h3 { margin: 0; font-size: 13px; }
.library-group__head span { color: #8996a7; font: 600 10px var(--cg-font-mono); }
.list { list-style: none; margin: 0; padding: 0; }
.list li + li { border-top: 1px solid #edf0f5; }
.item { width: 100%; min-height: 47px; padding: 7px 2px; display: flex; align-items: center; gap: 8px; border: 0; background: transparent; text-align: left; cursor: pointer; }
.item:hover { color: #2563eb; background: #f8fbff; }
.item__text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.item__text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 650; }
.item__text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8996a7; font-size: 10px; }
.item svg { flex: 0 0 auto; color: #b1bdcd; }
.empty { margin: 0; padding: 14px 0; color: #8996a7; font-size: 12px; }
.foot { min-height: 41px; margin: 0 16px; border-top: 1px solid #edf0f5; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.foot button { padding: 4px 0; border: 0; background: transparent; color: #466285; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.foot button:hover { color: #2563eb; }
.foot span { color: #a3adbc; font: 600 10px var(--cg-font-mono); }
.toast { position: absolute; bottom: 45px; left: 16px; right: 16px; margin: 0; padding: 9px 12px; border: 1px solid #bcd8ff; border-radius: 9px; background: #eff6ff; color: #1d4ed8; font-size: 12px; box-shadow: 0 6px 16px rgba(29, 78, 216, .12); }
button:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
</style>
