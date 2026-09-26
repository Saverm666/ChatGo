<script setup lang="ts">
import { computed, nextTick, ref, onBeforeUnmount, onMounted } from 'vue'
import {
  Bookmark,
  Check,
  Clipboard,
  Copy,
  FileText,
  Globe2,
  History,
  Pencil,
  Pin,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2
} from '@lucide/vue'
import type { ChatGoSettings, FormulaHistoryEntry, SavedPrompt } from '@/main/types'
import {
  FORMULA_COPY_FORMAT_LABELS,
  MARKDOWN_FORMULA_WRAP_LABELS
} from '@/main/constants'
import {
  SITE_ACTIVATION_MODE_LABELS,
  SUPPORTED_SITE_ITEMS,
  normalizeSiteHostname,
  sanitizeSiteList
} from '@/main/site-policy'
import { copyTextToClipboard, formatTimestamp, truncateText } from '@/main/utils'
import {
  readSettings,
  writeSettings,
  readPrompts,
  writePrompts,
  readFormulaHistory,
  clearFormulaHistory
} from '@/main/storage'
import ToggleRow from '@/components/ToggleRow.vue'
import RadioRow from '@/components/RadioRow.vue'
import PromptEditor from '@/content/ui/PromptEditor.vue'
import { editorBridge, type OpenEditorPayload } from '@/content/editor-bridge'
import { getPromptCategory } from '@/content/prompt-utils'
import { renderFormulaPreview } from '@/content/formula-preview'

const settings = ref<ChatGoSettings | null>(null)
const prompts = ref<SavedPrompt[]>([])
const history = ref<FormulaHistoryEntry[]>([])
const saveStatus = ref('')
const promptStatus = ref('')
const editorPayload = ref<OpenEditorPayload | null>(null)
const siteWhitelistInput = ref('')
const siteBlacklistInput = ref('')
const activeSection = ref('prompts')
let unsubEditor: (() => void) | null = null

const navItems = [
  { id: 'prompts', label: '提示词', icon: Bookmark },
  { id: 'history', label: '公式历史', icon: History },
  { id: 'formats', label: '复制格式', icon: Clipboard },
  { id: 'features', label: '功能开关', icon: SlidersHorizontal },
  { id: 'sites', label: '支持站点', icon: Globe2 }
]

function setSaveStatus(message: string): void {
  saveStatus.value = message
  window.setTimeout(() => {
    if (saveStatus.value === message) saveStatus.value = ''
  }, 2200)
}

function setPromptStatus(message: string): void {
  promptStatus.value = message
  window.setTimeout(() => {
    if (promptStatus.value === message) promptStatus.value = ''
  }, 2600)
}

const siteModeOptions = computed(() => {
  return Object.entries(SITE_ACTIVATION_MODE_LABELS).map(([value, label]) => ({ value, label }))
})
const whitelistSites = computed(() => sanitizeSiteList(settings.value?.siteWhitelist))
const blacklistSites = computed(() => sanitizeSiteList(settings.value?.siteBlacklist))

async function loadData(): Promise<void> {
  const [s, p, h] = await Promise.all([readSettings(), readPrompts(), readFormulaHistory()])
  settings.value = s
  prompts.value = [...p].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
  history.value = h
}

async function update<K extends keyof ChatGoSettings>(key: K, value: ChatGoSettings[K]): Promise<void> {
  if (!settings.value) return
  ;(settings.value as Record<string, unknown>)[key] = value
  await writeSettings({ [key]: value } as Partial<ChatGoSettings>)
  setSaveStatus('已保存')
}

async function updateSiteLists(whitelist: string[], blacklist: string[], message = '已保存'): Promise<void> {
  if (!settings.value) return
  const nextWhitelist = sanitizeSiteList(whitelist)
  const nextBlacklist = sanitizeSiteList(blacklist).filter((item) => !nextWhitelist.includes(item))
  settings.value.siteWhitelist = nextWhitelist
  settings.value.siteBlacklist = nextBlacklist
  await writeSettings({ siteWhitelist: nextWhitelist, siteBlacklist: nextBlacklist })
  setSaveStatus(message)
}

async function addWhitelistSite(): Promise<void> {
  const hostname = normalizeSiteHostname(siteWhitelistInput.value)
  if (!hostname) return
  siteWhitelistInput.value = ''
  await updateSiteLists([...whitelistSites.value, hostname], blacklistSites.value.filter((item) => item !== hostname), '已加入白名单')
}

async function addBlacklistSite(): Promise<void> {
  const hostname = normalizeSiteHostname(siteBlacklistInput.value)
  if (!hostname) return
  siteBlacklistInput.value = ''
  await updateSiteLists(whitelistSites.value.filter((item) => item !== hostname), [...blacklistSites.value, hostname], '已加入黑名单')
}

async function removeWhitelistSite(hostname: string): Promise<void> {
  await updateSiteLists(whitelistSites.value.filter((item) => item !== hostname), blacklistSites.value, '已移出白名单')
}

async function removeBlacklistSite(hostname: string): Promise<void> {
  await updateSiteLists(whitelistSites.value, blacklistSites.value.filter((item) => item !== hostname), '已移出黑名单')
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

function getFormulaSiteName(entry: FormulaHistoryEntry): string {
  try {
    const hostname = new URL(entry.sourceUrl).hostname.replace(/^www\./, '')
    if (hostname === 'chatgpt.com') return 'ChatGPT'
    if (hostname === 'chat.deepseek.com') return 'DeepSeek'
    if (hostname === 'gemini.google.com') return 'Gemini'
    if (hostname === 'chat.qwen.ai') return 'Qwen'
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

async function deletePrompt(id: string): Promise<void> {
  const list = await readPrompts()
  await writePrompts(list.filter((p) => p.id !== id))
  await loadData()
  setPromptStatus('已删除')
}

async function togglePin(id: string): Promise<void> {
  const list = await readPrompts()
  await writePrompts(list.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)))
  await loadData()
}

async function copyPrompt(prompt: SavedPrompt): Promise<void> {
  try {
    await copyTextToClipboard(prompt.content)
    setPromptStatus(`已复制「${prompt.name}」`)
  } catch (error) {
    setPromptStatus(error instanceof Error ? error.message : '复制失败')
  }
}

async function copyHistory(entry: FormulaHistoryEntry): Promise<void> {
  try {
    await copyTextToClipboard(entry.text)
    setSaveStatus('已复制')
  } catch (error) {
    setSaveStatus(error instanceof Error ? error.message : '复制失败')
  }
}

async function clearHistory(): Promise<void> {
  await clearFormulaHistory()
  history.value = []
  setSaveStatus('已清空')
}

onMounted(loadData)

async function syncActiveSection(): Promise<void> {
  const section = window.location.hash.slice(1)
  activeSection.value = navItems.some((item) => item.id === section) ? section : 'prompts'
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'instant' })
}

onMounted(() => {
  syncActiveSection()
  window.addEventListener('hashchange', syncActiveSection)
  unsubEditor = editorBridge.on((payload) => {
    editorPayload.value = payload
    if (!payload) loadData().catch(() => {})
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncActiveSection)
  unsubEditor?.()
})
</script>

<template>
  <div class="settings-shell">
    <aside class="settings-nav" aria-label="设置目录">
      <div class="brand">
        <div class="brand__mark">
          <svg viewBox="120 120 260 260" aria-hidden="true">
            <path d="M 170,140 H 330 A 30,30 0 0 1 360,170 V 270 A 30,30 0 0 1 330,300 H 220 L 160,350 V 300 A 30,30 0 0 1 140,270 V 170 A 30,30 0 0 1 170,140 Z" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
            <rect x="185" y="185" width="130" height="30" rx="10" fill="#E8F4FF" />
            <rect x="185" y="230" width="90" height="30" rx="10" fill="#4BA3FF" />
          </svg>
        </div>
        <div>
          <h1>ChatGo</h1>
          <p>扩展设置</p>
        </div>
      </div>

      <nav class="nav-links">
        <a
          v-for="item in navItems"
          :key="item.id"
          :href="`#${item.id}`"
          class="nav-link"
          :class="{ 'nav-link--active': activeSection === item.id }"
          :aria-current="activeSection === item.id ? 'page' : undefined"
        >
          <component :is="item.icon" aria-hidden="true" :size="17" :stroke-width="2" />
          <span>{{ item.label }}</span>
        </a>
      </nav>
    </aside>

    <main class="settings-main">
      <header class="page-head">
        <div>
          <p class="eyebrow">CHATGO / CONTROL CENTER</p>
          <h2>设置与收藏</h2>
        </div>
        <span v-if="saveStatus" class="status-pill">
          <Check aria-hidden="true" :size="14" :stroke-width="2.4" />
          {{ saveStatus }}
        </span>
      </header>

      <section v-if="activeSection === 'prompts'" class="settings-section" aria-label="提示词">
        <div class="section-head section-head--action">
          <div class="section-head__title">
            <Bookmark aria-hidden="true" :size="20" :stroke-width="2" />
            <div>
              <h3>提示词</h3>
              <p>管理常用提示词，在悬浮窗里快速复制、编辑和置顶。</p>
            </div>
          </div>
          <button class="btn btn--primary" type="button" @click="openNewPromptEditor">
            <Plus aria-hidden="true" :size="16" :stroke-width="2.2" />
            新建
          </button>
        </div>
        <span v-if="promptStatus" class="inline-status">{{ promptStatus }}</span>

        <div class="option-list-shell">
          <p v-if="prompts.length === 0" class="empty-state">
            <FileText aria-hidden="true" :size="34" :stroke-width="1.8" />
            还没有保存提示词
          </p>
          <ul v-else class="cg-card-list">
            <li v-for="p in prompts" :key="p.id" class="cg-prompt-card">
              <div class="cg-prompt-card__head">
                <div class="cg-prompt-title">
                  <span class="cg-prompt-category">{{ getPromptCategory(p) }}</span>
                  <h3>{{ p.name || '未命名提示词' }}</h3>
                </div>
                <div class="cg-card-actions">
                  <button class="cg-icon-btn" type="button" :aria-label="p.pinned ? '取消置顶' : '置顶'" :class="{ 'cg-icon-btn--active': p.pinned }" @click="togglePin(p.id)">
                    <Pin aria-hidden="true" :size="17" :stroke-width="2" :fill="p.pinned ? 'currentColor' : 'none'" />
                  </button>
                  <button class="cg-icon-btn" type="button" aria-label="复制" @click="copyPrompt(p)">
                    <Copy aria-hidden="true" :size="17" :stroke-width="2" />
                  </button>
                  <button class="cg-icon-btn" type="button" aria-label="编辑" @click="openEditPromptEditor(p)">
                    <Pencil aria-hidden="true" :size="17" :stroke-width="2" />
                  </button>
                  <button class="cg-icon-btn cg-icon-btn--danger" type="button" aria-label="删除" @click="deletePrompt(p.id)">
                    <Trash2 aria-hidden="true" :size="17" :stroke-width="2" />
                  </button>
                </div>
              </div>
              <p>{{ truncateText(p.content, 120) }}</p>
              <div class="cg-prompt-card__meta">
                <div class="cg-tag-row">
                  <span v-for="tag in (p.tags ?? []).slice(0, 4)" :key="tag" class="cg-tag">{{ tag }}</span>
                  <span v-if="(p.tags ?? []).length === 0" class="cg-tag cg-tag--muted">无标签</span>
                </div>
                <span class="cg-usage">{{ p.usedCount ?? 0 }} 次使用</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="activeSection === 'history'" class="settings-section" aria-label="公式历史">
        <div class="section-head section-head--action">
          <div class="section-head__title">
            <History aria-hidden="true" :size="20" :stroke-width="2" />
            <div>
              <h3>公式历史</h3>
              <p>查看最近复制过的公式，点击条目可再次复制。</p>
            </div>
          </div>
          <button v-if="history.length > 0" class="btn" type="button" @click="clearHistory">
            <Trash2 aria-hidden="true" :size="16" :stroke-width="2" />
            清空
          </button>
        </div>

        <div class="option-list-shell">
          <p v-if="history.length === 0" class="empty-state">
            <FileText aria-hidden="true" :size="34" :stroke-width="1.8" />
            还没有复制记录
          </p>
          <ol v-else class="cg-formula-list">
            <li v-for="(h, i) in history" :key="`${h.copiedAt}-${i}`" class="cg-formula-card">
              <div class="cg-formula-card__head">
                <div class="cg-formula-card__title">
                  <span class="cg-formula-card__index">{{ i + 1 }}</span>
                  <h3>{{ getFormulaRecordTitle(h) }}</h3>
                </div>
                <button class="cg-copy-btn" type="button" @click="copyHistory(h)">
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
        </div>
      </section>

      <section v-if="settings && activeSection === 'formats'" class="settings-section" aria-label="复制格式">
        <div class="section-head">
          <Clipboard aria-hidden="true" :size="20" :stroke-width="2" />
          <div>
            <h3>复制格式</h3>
            <p>控制公式复制和 Markdown 输出的默认格式。</p>
          </div>
        </div>

        <div class="setting-group">
          <div class="setting-label">
            <strong>公式复制格式</strong>
            <span>点击公式复制时使用的输出类型。</span>
          </div>
          <RadioRow
            v-model="settings.formulaCopyFormat"
            name="opt-formula-format"
            :options="[
              { value: 'latex', label: FORMULA_COPY_FORMAT_LABELS.latex },
              { value: 'unicode-math', label: FORMULA_COPY_FORMAT_LABELS['unicode-math'] },
              { value: 'latex-source', label: FORMULA_COPY_FORMAT_LABELS['latex-source'] }
            ]"
            @update:model-value="update('formulaCopyFormat', $event as ChatGoSettings['formulaCopyFormat'])"
          />
        </div>

        <div class="setting-group">
          <div class="setting-label">
            <strong>公式在 Markdown 中</strong>
            <span>决定选区复制时公式是否保留分隔符。</span>
          </div>
          <RadioRow
            v-model="settings.markdownFormulaWrapMode"
            name="opt-wrap-mode"
            :options="[
              { value: 'with-delimiters', label: MARKDOWN_FORMULA_WRAP_LABELS['with-delimiters'] },
              { value: 'bare', label: MARKDOWN_FORMULA_WRAP_LABELS.bare }
            ]"
            @update:model-value="update('markdownFormulaWrapMode', $event as ChatGoSettings['markdownFormulaWrapMode'])"
          />
        </div>
      </section>

      <section v-if="settings && activeSection === 'features'" class="settings-section" aria-label="功能开关">
        <div class="section-head">
          <Settings2 aria-hidden="true" :size="20" :stroke-width="2" />
          <div>
            <h3>功能开关</h3>
            <p>开启或关闭页面增强能力。</p>
          </div>
        </div>

        <div class="toggle-list">
          <ToggleRow
            v-model="settings.formulaCopierEnabled"
            label="公式点击复制"
            hint="点击公式即按选定格式复制"
            @update:model-value="update('formulaCopierEnabled', $event)"
          />
          <ToggleRow
            v-model="settings.markdownCopyEnabled"
            label="选区复制为 Markdown"
            hint="框选复制时保留 Markdown 结构"
            @update:model-value="update('markdownCopyEnabled', $event)"
          />
          <ToggleRow
            v-model="settings.enterEnhancerEnabled"
            label="Enter / Ctrl+Enter 增强"
            hint="Enter 换行，Ctrl+Enter 发送"
            @update:model-value="update('enterEnhancerEnabled', $event)"
          />
          <ToggleRow
            v-model="settings.branchEnabled"
            label="分支提问"
            hint="选区转引用，在新对话页打开"
            @update:model-value="update('branchEnabled', $event)"
          />
          <ToggleRow
            v-model="settings.conversationNavigatorEnabled"
            label="对话节点导航"
            hint="至少两条提问时显示；官方目录出现时自动隐藏"
            @update:model-value="update('conversationNavigatorEnabled', $event)"
          />
          <ToggleRow
            v-model="settings.floatingPanelEnabled"
            label="悬浮窗"
            hint="在页面显示可拖动入口"
            @update:model-value="update('floatingPanelEnabled', $event)"
          />
        </div>
      </section>

      <section v-if="settings && activeSection === 'sites'" class="settings-section" aria-label="支持站点">
        <div class="section-head">
          <Globe2 aria-hidden="true" :size="20" :stroke-width="2" />
          <div>
            <h3>支持站点</h3>
            <p>配置默认启用范围。站点被停用后仍可从这里或扩展弹窗重新启用。</p>
          </div>
        </div>

        <div class="setting-group">
          <div class="setting-label">
            <strong>默认启用模式</strong>
            <span>决定未进入白名单或黑名单的站点是否运行 ChatGo。</span>
          </div>
          <RadioRow
            v-model="settings.siteActivationMode"
            name="opt-site-mode"
            :options="siteModeOptions"
            @update:model-value="update('siteActivationMode', $event as ChatGoSettings['siteActivationMode'])"
          />
        </div>

        <div class="site-grid">
          <section class="site-panel">
            <div class="site-panel__head">
              <h4>白名单站点</h4>
              <p>这些站点会强制启用，优先级高于默认模式。</p>
            </div>
            <form class="site-add" @submit.prevent="addWhitelistSite">
              <input v-model="siteWhitelistInput" type="text" placeholder="chatgpt.com" />
              <button class="btn" type="submit">添加</button>
            </form>
            <div v-if="whitelistSites.length" class="site-chip-list">
              <button v-for="hostname in whitelistSites" :key="hostname" class="site-chip" type="button" @click="removeWhitelistSite(hostname)">
                <span>{{ hostname }}</span>
                <Trash2 aria-hidden="true" :size="13" :stroke-width="2.2" />
              </button>
            </div>
            <p v-else class="site-empty">还没有白名单站点</p>
          </section>

          <section class="site-panel">
            <div class="site-panel__head">
              <h4>黑名单站点</h4>
              <p>这些站点会停用 ChatGo，可从这里移除恢复。</p>
            </div>
            <form class="site-add" @submit.prevent="addBlacklistSite">
              <input v-model="siteBlacklistInput" type="text" placeholder="example.com" />
              <button class="btn" type="submit">添加</button>
            </form>
            <div v-if="blacklistSites.length" class="site-chip-list">
              <button v-for="hostname in blacklistSites" :key="hostname" class="site-chip site-chip--danger" type="button" @click="removeBlacklistSite(hostname)">
                <span>{{ hostname }}</span>
                <Trash2 aria-hidden="true" :size="13" :stroke-width="2.2" />
              </button>
            </div>
            <p v-else class="site-empty">还没有黑名单站点</p>
          </section>
        </div>

        <section class="site-panel">
          <div class="site-panel__head">
            <h4>内置适配器</h4>
            <p>当前仅在这些内置支持站点注入 ChatGo。</p>
          </div>
          <ul class="supported-sites">
            <li v-for="item in SUPPORTED_SITE_ITEMS" :key="item.id">
              <strong>{{ item.name }}</strong>
              <span>{{ item.pages }}</span>
            </li>
          </ul>
        </section>
      </section>
    </main>

    <PromptEditor
      v-if="editorPayload"
      :key="`${editorPayload.editingPromptId || 'new'}-${editorPayload.promptName}-${editorPayload.promptContent}`"
      v-bind="editorPayload"
    />
  </div>
</template>

<style scoped>
.settings-shell {
  --cg-panel-blue: var(--cg-accent-600);
  --cg-panel-blue-soft: var(--cg-accent-subtle);
  --cg-panel-danger: #DC2626;
  width: min(1180px, calc(100% - 64px));
  margin: 0 auto;
  padding: 32px 0 56px;
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  gap: 28px;
  font-family: var(--cg-font-body);
  color: var(--cg-text);
}

.settings-nav {
  position: sticky;
  top: 24px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 20px 12px 16px;
  background: #FFFFFF;
  border: 1px solid #E5EBF4;
  border-radius: 18px;
  box-shadow: 0 8px 28px rgba(31, 55, 92, 0.04);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
}

.brand__mark {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand__mark svg {
  width: 42px;
  height: 42px;
}

.brand h1 {
  margin: 0;
  font-family: var(--cg-font-display);
  font-size: 20px;
  font-weight: 760;
  line-height: 1.1;
}

.brand p {
  margin: 3px 0 0;
  color: var(--cg-text-muted);
  font-size: 13px;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav-link {
  min-height: 40px;
  color: #667085;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 680;
  transition: color 140ms ease, background 140ms ease;
}

.nav-link:hover {
  color: var(--cg-accent-600);
  background: rgba(239, 246, 255, 0.48);
}

.nav-link--active {
  background: #EFF6FF;
  color: #1D4ED8;
}

.nav-link--active svg { color: #2563EB; }

.nav-link:focus-visible { outline: 2px solid #3B82F6; outline-offset: 2px; }

.nav-link svg {
  width: 17px;
  height: 17px;
}

.settings-main {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-head {
  min-height: 78px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 8px 2px 0;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--cg-accent-600);
  font: 700 11px/1.2 var(--cg-font-mono);
  letter-spacing: 0.06em;
  font-weight: 760;
}

.page-head h2 {
  margin: 0;
  font-family: var(--cg-font-display);
  font-size: 30px;
  line-height: 1.1;
  font-weight: 780;
  letter-spacing: -0.02em;
}

.status-pill,
.inline-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--cg-accent-600);
  font-size: 13px;
  font-weight: 680;
}

.status-pill {
  padding-top: 8px;
}

.settings-section {
  width: 100%;
  min-width: 0;
  padding: 24px 26px;
  border: 1px solid #E5EBF4;
  border-radius: 18px;
  background: #FFFFFF;
  box-shadow: 0 8px 28px rgba(31, 55, 92, 0.035);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.settings-section:last-child {
  border-bottom: 1px solid #E5EBF4;
}

.section-head,
.section-head__title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.section-head--action {
  justify-content: space-between;
  gap: 18px;
}

.section-head > svg,
.section-head__title > svg {
  color: var(--cg-accent-600);
  margin-top: 0;
  flex-shrink: 0;
  box-sizing: content-box;
  padding: 8px;
  border-radius: 10px;
  background: #EFF6FF;
}

.section-head h3 {
  margin: 0;
  font-family: var(--cg-font-display);
  font-size: 19px;
  font-weight: 760;
  letter-spacing: -0.01em;
}

.section-head p {
  margin: 5px 0 0;
  color: var(--cg-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.setting-label strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 720;
}

.keep-latest input {
  width: 100%;
  border: 1px solid var(--cg-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--cg-text);
  font: inherit;
  font-size: 14px;
  transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
}

.keep-latest input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.52);
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(239, 246, 255, 0.96);
}

.btn {
  font: inherit;
}

.btn {
  height: 38px;
  border: 1px solid var(--cg-border);
  border-radius: 12px;
  background: #FFFFFF;
  color: #344054;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 680;
  white-space: nowrap;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.btn:hover {
  border-color: rgba(37, 99, 235, 0.30);
  background: var(--cg-accent-subtle);
  color: var(--cg-accent-600);
}

.btn--primary {
  border-color: var(--cg-accent-600);
  background: var(--cg-accent-600);
  color: #FFFFFF;
}

.btn--primary:hover {
  background: #1D4ED8;
  color: #FFFFFF;
}

.option-list-shell {
  display: flex;
  flex-direction: column;
  border-top: 1px solid #EDF1F6;
  border-bottom: 1px solid #EDF1F6;
}

.empty-state {
  min-height: 190px;
  margin: 0;
  color: #A2AAB8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 680;
}

.empty-state svg {
  color: #D0D5DD;
}

.option-list-shell :deep(.cg-prompt-card),
.option-list-shell :deep(.cg-formula-card) {
  padding-left: 0;
  padding-right: 0;
}

.option-list-shell :deep(.cg-prompt-category) {
  max-width: 92px;
}

.option-list-shell :deep(.cg-tag) {
  max-width: 96px;
}

.option-list-shell :deep(.cg-copy-btn) {
  background: #FFFFFF;
}

.option-list-shell :deep(.cg-formula-card__formula .katex-display) {
  max-width: 100%;
}

.setting-group {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  padding: 16px 0;
  border-top: 1px solid rgba(226, 232, 240, 0.82);
}

.setting-group:last-child {
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.setting-label span {
  color: var(--cg-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.toggle-list {
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.toggle-list :deep(.cg-toggle) {
  min-height: 56px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.toggle-list :deep(.cg-toggle:last-child) {
  border-bottom: none;
}

.keep-latest {
  padding: 12px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.keep-latest label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: #0F172A;
  font-size: 13px;
  font-weight: 680;
}

.keep-latest input {
  max-width: 96px;
  height: 36px;
  padding: 0 10px;
}

.site-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.site-panel {
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.site-panel__head h4 {
  margin: 0;
  color: #0F172A;
  font-size: 14px;
  font-weight: 740;
}

.site-panel__head p {
  margin: 5px 0 0;
  color: var(--cg-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.site-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.site-add input {
  min-width: 0;
  height: 38px;
  border: 1px solid var(--cg-border);
  border-radius: 12px;
  background: #FFFFFF;
  color: var(--cg-text);
  font: inherit;
  font-size: 13px;
  padding: 0 12px;
}

.site-add input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.52);
  box-shadow: 0 0 0 3px rgba(239, 246, 255, 0.96);
}

.site-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.site-chip {
  min-height: 30px;
  border: 1px solid rgba(59, 130, 246, 0.24);
  border-radius: 999px;
  background: var(--cg-accent-subtle);
  color: var(--cg-accent-600);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px 0 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 680;
  cursor: pointer;
}

.site-chip--danger {
  border-color: rgba(220, 38, 38, 0.24);
  background: #FEF2F2;
  color: #B91C1C;
}

.site-empty {
  min-height: 42px;
  margin: 0;
  color: #A2AAB8;
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 650;
}

.supported-sites {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.supported-sites li {
  border: 1px solid var(--cg-border);
  border-radius: 12px;
  background: #FFFFFF;
  padding: 12px;
}

.supported-sites strong,
.supported-sites span {
  display: block;
}

.supported-sites strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 720;
}

.supported-sites span {
  margin-top: 4px;
  color: var(--cg-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 900px) {
  .settings-shell {
    width: min(760px, calc(100% - 32px));
    grid-template-columns: 1fr;
    gap: 22px;
  }

  .settings-nav {
    position: static;
  }

  .nav-links {
    flex-direction: row;
    flex-wrap: wrap;
    border: none;
    gap: 8px;
    padding-bottom: 2px;
  }

  .nav-link {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--cg-border);
    border-radius: 12px;
    white-space: nowrap;
  }

  .setting-group {
    grid-template-columns: 1fr;
  }

  .site-grid,
  .supported-sites {
    grid-template-columns: 1fr;
  }

  .option-list-shell :deep(.cg-formula-card__meta) {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .option-list-shell :deep(.cg-formula-card__meta span) {
    text-align: left;
  }
}

@media (max-width: 560px) {
  .settings-shell {
    width: calc(100% - 24px);
    padding-top: 22px;
  }

  .page-head,
  .section-head--action {
    flex-direction: column;
  }
}
</style>
