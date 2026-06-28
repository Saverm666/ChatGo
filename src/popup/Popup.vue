<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ChatGoSettings, FormulaHistoryEntry, SavedPrompt } from '@/main/types'
import {
  FORMULA_COPY_FORMAT_LABELS,
  MARKDOWN_FORMULA_WRAP_LABELS
} from '@/main/constants'
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

onMounted(async () => {
  await Promise.all([loadPageInfo(), loadData()])
})
</script>

<template>
  <main class="popup">
    <header class="head">
      <div class="head__mark">
        <svg viewBox="120 120 260 260" aria-hidden="true">
          <path d="M 170,140 H 330 A 30,30 0 0 1 360,170 V 270 A 30,30 0 0 1 330,300 H 220 L 160,350 V 300 A 30,30 0 0 1 140,270 V 170 A 30,30 0 0 1 170,140 Z" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
          <rect x="185" y="185" width="130" height="30" rx="10" fill="#E8F4FF" />
          <rect x="185" y="230" width="90" height="30" rx="10" fill="#4BA3FF" />
        </svg>
      </div>
      <div>
        <h1>ChatGo</h1>
        <p class="head__site">{{ adapterName ? adapterName : '未识别站点' }}</p>
      </div>
    </header>

    <section v-if="settings" class="card">
      <div class="card__section">
        <p class="card__label">公式复制格式</p>
        <RadioRow
          v-model="settings.formulaCopyFormat"
          name="formula-format"
          :options="[
            { value: 'latex', label: FORMULA_COPY_FORMAT_LABELS.latex },
            { value: 'unicode-math', label: FORMULA_COPY_FORMAT_LABELS['unicode-math'] },
            { value: 'latex-source', label: FORMULA_COPY_FORMAT_LABELS['latex-source'] }
          ]"
          @update:model-value="update('formulaCopyFormat', $event as ChatGoSettings['formulaCopyFormat'])"
        />
      </div>

      <div class="card__section">
        <p class="card__label">公式在 Markdown 中</p>
        <RadioRow
          v-model="settings.markdownFormulaWrapMode"
          name="wrap-mode"
          :options="[
            { value: 'with-delimiters', label: MARKDOWN_FORMULA_WRAP_LABELS['with-delimiters'] },
            { value: 'bare', label: MARKDOWN_FORMULA_WRAP_LABELS.bare }
          ]"
          @update:model-value="update('markdownFormulaWrapMode', $event as ChatGoSettings['markdownFormulaWrapMode'])"
        />
      </div>

      <div class="card__divider" />

      <ToggleRow
        v-model="settings.formulaCopierEnabled"
        label="公式点击复制"
        hint="点击公式按上方格式复制"
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
        label="Enter / Ctrl+Enter"
        hint="Enter 换行，Ctrl+Enter 发送"
        @update:model-value="update('enterEnhancerEnabled', $event)"
      />
      <ToggleRow
        v-model="settings.collapseEnabled"
        label="长对话折叠"
        hint="隐藏较早消息，保留最近 N 轮"
        @update:model-value="update('collapseEnabled', $event)"
      />
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
    </section>

    <section class="card">
      <p class="card__label">提示词</p>
      <p v-if="sortedPrompts.length === 0" class="empty">还没有保存提示词</p>
      <ul v-else class="list">
        <li v-for="p in sortedPrompts.slice(0, 6)" :key="p.id">
          <button class="item" @click="copyPrompt(p)">
            <span class="item__title">{{ p.pinned ? '★ ' : '' }}{{ p.name || '未命名' }}</span>
            <span class="item__sub">{{ truncateText(p.content, 36) }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section class="card">
      <p class="card__label">公式历史</p>
      <p v-if="history.length === 0" class="empty">还没有复制记录</p>
      <ul v-else class="list">
        <li v-for="(h, i) in history.slice(0, 6)" :key="i">
          <button class="item" @click="copyHistoryEntry(h)">
            <span class="item__title">{{ FORMULA_COPY_FORMAT_LABELS[h.format] }}</span>
            <span class="item__sub">{{ formatTimestamp(h.copiedAt) }} · {{ truncateText(h.latexSource || h.text, 28) }}</span>
          </button>
        </li>
      </ul>
    </section>

    <footer class="foot">
      <button class="foot__btn" @click="openOptions">打开完整设置</button>
      <p v-if="status" class="foot__status">{{ status }}</p>
    </footer>
  </main>
</template>

<style scoped>
.popup {
  width: 360px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--cg-font-body);
  background: var(--cg-bg);
  color: var(--cg-text);
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px;
}
.head__mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.head__mark svg {
  width: 38px;
  height: 38px;
}
.head h1 {
  font-family: var(--cg-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.2;
}
.head__site {
  font-size: 12px;
  color: var(--cg-text-muted);
  line-height: 1.2;
  margin: 0;
}
.card {
  background: var(--cg-bg-soft);
  border: 1px solid var(--cg-border);
  border-radius: var(--cg-radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.card__section {
  padding: 4px 0 10px;
}
.card__section + .card__section {
  padding-top: 12px;
  border-top: 1px solid var(--cg-border);
}
.card__label {
  font-size: 11px;
  font-weight: 700;
  color: var(--cg-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 10px;
}
.card__divider {
  height: 1px;
  background: var(--cg-border);
  margin: 8px 0;
}
.empty {
  font-size: 13px;
  color: var(--cg-text-muted);
  padding: 8px 0;
}
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item {
  width: 100%;
  text-align: left;
  border: none;
  background: var(--cg-bg);
  border: 1px solid var(--cg-border);
  border-radius: var(--cg-radius-sm);
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: all 0.12s ease;
}
.item:hover {
  border-color: var(--cg-accent-200);
  background: var(--cg-accent-subtle);
}
.item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cg-text);
}
.item__sub {
  font-size: 11px;
  color: var(--cg-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding-top: 4px;
}
.foot__btn {
  width: 100%;
  border: 1px solid var(--cg-border-strong);
  background: var(--cg-bg);
  color: var(--cg-text);
  border-radius: var(--cg-radius-sm);
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}
.foot__btn:hover {
  border-color: var(--cg-accent);
  color: var(--cg-accent);
  background: var(--cg-accent-subtle);
}
.foot__status {
  font-size: 12px;
  color: var(--cg-accent);
}
</style>
