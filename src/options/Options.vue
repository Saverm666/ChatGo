<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from 'vue'
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
import { copyTextToClipboard, formatTimestamp, truncateText, normalizeKeepLatest } from '@/main/utils'
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
import { renderFormulaPreview } from '@/content/markdown'

const settings = ref<ChatGoSettings | null>(null)
const prompts = ref<SavedPrompt[]>([])
const history = ref<FormulaHistoryEntry[]>([])
const saveStatus = ref('')
const promptStatus = ref('')
const editorPayload = ref<OpenEditorPayload | null>(null)
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

onMounted(() => {
  unsubEditor = editorBridge.on((payload) => {
    editorPayload.value = payload
    if (!payload) loadData().catch(() => {})
  })
})

onBeforeUnmount(() => {
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
        <a v-for="item in navItems" :key="item.id" :href="`#${item.id}`" class="nav-link">
          <component :is="item.icon" aria-hidden="true" :size="17" :stroke-width="2" />
          <span>{{ item.label }}</span>
        </a>
      </nav>
    </aside>

    <main class="settings-main">
      <header class="page-head">
        <div>
          <p class="eyebrow">ChatGo Settings</p>
          <h2>设置</h2>
        </div>
        <span v-if="saveStatus" class="status-pill">
          <Check aria-hidden="true" :size="14" :stroke-width="2.4" />
          {{ saveStatus }}
        </span>
      </header>

      <section id="prompts" class="settings-section">
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

      <section id="history" class="settings-section">
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

      <section v-if="settings" id="formats" class="settings-section">
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

      <section v-if="settings" id="features" class="settings-section">
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
            v-model="settings.collapseEnabled"
            label="长对话折叠"
            hint="隐藏较早消息，保留最近 N 轮"
            @update:model-value="update('collapseEnabled', $event)"
          />
          <div v-if="settings.collapseEnabled" class="keep-latest">
            <label>
              <span>保留最近轮数</span>
              <input
                type="number"
                min="1"
                max="1000"
                :value="settings.collapseKeepLatest"
                @change="update('collapseKeepLatest', normalizeKeepLatest(Number(($event.target as HTMLInputElement).value)))"
              />
            </label>
          </div>
          <ToggleRow
            v-model="settings.branchEnabled"
            label="分支提问"
            hint="选区转引用，在新对话页打开"
            @update:model-value="update('branchEnabled', $event)"
          />
          <ToggleRow
            v-model="settings.floatingPanelEnabled"
            label="悬浮窗"
            hint="在页面显示可拖动入口"
            @update:model-value="update('floatingPanelEnabled', $event)"
          />
        </div>
      </section>

      <section id="sites" class="settings-section">
        <div class="section-head">
          <Globe2 aria-hidden="true" :size="20" :stroke-width="2" />
          <div>
            <h3>支持站点</h3>
            <p>ChatGPT、DeepSeek、Gemini、NextChat / ChatGPT-Next-Web、LobeChat，以及其他站点自动启发式适配。</p>
          </div>
        </div>
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
  width: 60vw;
  margin: 0 auto;
  padding: 34px 0 48px;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 34px;
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
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
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
  font-size: 18px;
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
  border-top: 1px solid var(--cg-border);
  border-bottom: 1px solid var(--cg-border);
}

.nav-link {
  min-height: 42px;
  color: #667085;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
  font-size: 13px;
  font-weight: 680;
  transition: color 140ms ease, background 140ms ease;
}

.nav-link:last-child {
  border-bottom: none;
}

.nav-link:hover {
  color: var(--cg-accent-600);
  background: rgba(239, 246, 255, 0.48);
}

.nav-link svg {
  width: 17px;
  height: 17px;
}

.settings-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.page-head {
  min-height: 86px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--cg-border);
  margin-bottom: 6px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--cg-accent-600);
  font-size: 12px;
  font-weight: 760;
}

.page-head h2 {
  margin: 0;
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
  scroll-margin-top: 28px;
  padding: 28px 0;
  border-bottom: 1px solid var(--cg-border);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.settings-section:last-child {
  border-bottom: none;
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
  margin-top: 2px;
  flex-shrink: 0;
}

.section-head h3 {
  margin: 0;
  font-size: 18px;
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
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
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

:global(html) {
  scroll-behavior: smooth;
}

@media (max-width: 900px) {
  .settings-shell {
    width: min(760px, calc(100vw - 32px));
    grid-template-columns: 1fr;
    gap: 22px;
  }

  .settings-nav {
    position: static;
  }

  .nav-links {
    overflow-x: auto;
    flex-direction: row;
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
    width: calc(100vw - 24px);
    padding-top: 22px;
  }

  .page-head,
  .section-head--action {
    flex-direction: column;
  }
}
</style>
