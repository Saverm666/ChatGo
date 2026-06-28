<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { History, X } from '@lucide/vue'
import CgButton from '@/content/ui/CgButton.vue'
import CgConfirmDialog from '@/content/ui/CgConfirmDialog.vue'
import CgMarkdownSplit from '@/content/ui/CgMarkdownSplit.vue'
import CgSelect from '@/content/ui/CgSelect.vue'
import CgTextField from '@/content/ui/CgTextField.vue'
import { renderPromptMarkdown } from '@/content/markdown'
import {
  buildDraftKey,
  createDraft,
  debounceSaveDraft,
  legacyNewDraftKeys
} from '@/content/prompt-draft'
import type { PromptDraft, SavedPrompt } from '@/main/types'
import { PROMPT_CATEGORIES } from '@/content/prompt-utils'
import { inferPromptCategory, normalizePromptTags } from '@/content/prompt-utils'
import { createItemId } from '@/main/utils'
import {
  readPrompts,
  readPromptDrafts,
  writePrompts,
  writePromptDraft,
  clearPromptDraft,
  clearPromptDraftsByKeys
} from '@/main/storage'
import { editorBridge } from '@/content/editor-bridge'

const props = defineProps<{
  editingPromptId: string
  promptName: string
  promptContent: string
  promptCategory: string
  promptTagsInput: string
}>()

const isEditingPrompt = computed(() => Boolean(props.editingPromptId))
const formatDraftTime = computed(() =>
  draftSavedAt.value
    ? new Date(draftSavedAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : ''
)

const promptName = ref(props.promptName)
const promptContent = ref(props.promptContent)
const promptCategory = ref(props.promptCategory || '其他')
const promptTagsInput = ref(props.promptTagsInput)
const editingContent = ref(props.promptContent)
const editorSplitRatio = ref(0.5)
const draftKey = ref(buildDraftKey(props.editingPromptId))
const draftSavedAt = ref(0)
const draftBarVisible = ref(false)
let draftBarTimer: ReturnType<typeof setTimeout> | null = null
const statusMessage = ref('')
const confirmDelete = ref({ open: false })
let statusTimer: ReturnType<typeof setTimeout> | null = null

const renderResult = computed(() => {
  if (!editingContent.value) return { html: '', unclosedFormula: false }
  return renderPromptMarkdown(editingContent.value)
})

function setStatus(message: string): void {
  statusMessage.value = message
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    statusMessage.value = ''
    statusTimer = null
  }, 2000)
}

function currentDraftData(): PromptDraft {
  return createDraft(
    draftKey.value,
    props.editingPromptId,
    promptName.value,
    promptCategory.value,
    promptTagsInput.value,
    editingContent.value,
    editorSplitRatio.value
  )
}

function hasDraftContent(): boolean {
  return Boolean(
    promptName.value.trim() ||
    editingContent.value.trim() ||
    promptTagsInput.value.trim()
  )
}

let _debouncedSave: ((draft: PromptDraft) => void) | null = null
const DRAFT_UI_THROTTLE_MS = 30000
const DRAFT_BAR_AUTOHIDE_MS = 10000

function showDraftBar(savedAt: number): void {
  draftSavedAt.value = savedAt
  draftBarVisible.value = true
  if (draftBarTimer) clearTimeout(draftBarTimer)
  draftBarTimer = setTimeout(() => {
    draftBarVisible.value = false
    draftBarTimer = null
  }, DRAFT_BAR_AUTOHIDE_MS)
}

function getDebouncedSave(): (draft: PromptDraft) => void {
  if (!_debouncedSave) {
    _debouncedSave = debounceSaveDraft((draft: PromptDraft) => {
      writePromptDraft(draft)
      const now = Date.now()
      if (now - draftSavedAt.value >= DRAFT_UI_THROTTLE_MS) {
        showDraftBar(now)
      }
    })
  }
  return _debouncedSave
}

function flushSave(): void {
  if (!draftKey.value || !hasDraftContent()) return
  getDebouncedSave()(currentDraftData())
}

function flushDraftNow(): Promise<void> {
  if (!draftKey.value || !hasDraftContent()) return Promise.resolve()
  return writePromptDraft(currentDraftData())
}

async function loadPendingDraft(): Promise<void> {
  if (!draftKey.value) return
  const drafts = await readPromptDrafts()
  const legacy = legacyNewDraftKeys(drafts)
  if (legacy.length > 0) await clearPromptDraftsByKeys(legacy)
  const draft = drafts[draftKey.value]
  if (!draft) {
    draftSavedAt.value = 0
    draftBarVisible.value = false
    return
  }
  promptName.value = draft.name
  promptContent.value = draft.content
  promptCategory.value = draft.category || '其他'
  promptTagsInput.value = draft.tagsInput
  editingContent.value = draft.content
  editorSplitRatio.value = draft.splitRatio || 0.5
  showDraftBar(draft.updatedAt || 0)
}

loadPendingDraft()

function restoreDraft(): void {
  if (!draftSavedAt.value) return
  loadPendingDraft()
}

function discardDraft(): void {
  if (!draftKey.value) return
  clearPromptDraft(draftKey.value)
  draftSavedAt.value = 0
  draftBarVisible.value = false
  if (draftBarTimer) { clearTimeout(draftBarTimer); draftBarTimer = null }
}

async function closeEditor(): Promise<void> {
  await flushDraftNow()
  editorBridge.close()
}

async function savePrompt(): Promise<void> {
  const name = promptName.value.trim()
  const content = editingContent.value.trim() || promptContent.value.trim()
  if (!name) { setStatus('请填写提示词名称'); return }
  if (!content) { setStatus('请填写提示词内容'); return }
  const list = await readPrompts()
  const existing = list.find((p) => p.id === props.editingPromptId)
  const updated: SavedPrompt = {
    id: props.editingPromptId || createItemId('prompt'),
    name,
    content,
    pinned: existing?.pinned ?? false,
    updatedAt: Date.now(),
    createdAt: existing?.createdAt ?? Date.now(),
    category: promptCategory.value || inferPromptCategory({ name, content }),
    tags: normalizePromptTags(promptTagsInput.value),
    lastUsedAt: existing?.lastUsedAt,
    usedCount: existing?.usedCount
  }
  await writePrompts([updated, ...list.filter((p) => p.id !== props.editingPromptId)])
  if (draftKey.value) {
    await clearPromptDraft(draftKey.value)
    draftSavedAt.value = 0
    draftBarVisible.value = false
    if (draftBarTimer) { clearTimeout(draftBarTimer); draftBarTimer = null }
  }
  editorBridge.close()
}

async function handleDelete(): Promise<void> {
  confirmDelete.value.open = false
  const list = await readPrompts()
  await writePrompts(list.filter((p) => p.id !== props.editingPromptId))
  if (draftKey.value) await clearPromptDraft(draftKey.value)
  editorBridge.close()
}

watch(editingContent, () => {
  if (draftKey.value) flushSave()
})

watch(editorSplitRatio, () => {
  if (draftKey.value) flushSave()
})

onBeforeUnmount(() => {
  if (statusTimer) clearTimeout(statusTimer)
  if (draftBarTimer) clearTimeout(draftBarTimer)
})
</script>

<template>
  <div class="cg-editor-overlay">
    <div class="cg-editor-backdrop" @pointerdown="closeEditor" />
    <div
      class="cg-editor-page"
      @pointerdown.stop
      @keydown.escape="closeEditor"
    >
      <header class="cg-editor-page__head">
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
            <span class="cg-panel__site">{{ isEditingPrompt ? '编辑提示词' : '新建提示词' }}</span>
          </div>
        </div>
        <div class="cg-panel__head-actions">
          <span v-if="draftBarVisible" class="cg-editor-draft-inline">
            <History aria-hidden="true" :size="13" :stroke-width="2.2" />
            <span>草稿 {{ formatDraftTime }}</span>
            <button class="cg-draft-bar__btn" type="button" @click="restoreDraft">恢复</button>
            <button class="cg-draft-bar__btn cg-draft-bar__btn--danger" type="button" @click="discardDraft">丢弃</button>
          </span>
          <button
            class="cg-panel__close"
            type="button"
            aria-label="关闭"
            @click="closeEditor"
          >
            <X aria-hidden="true" :size="18" :stroke-width="2" />
          </button>
        </div>
      </header>

      <div class="cg-editor-page__meta">
        <CgTextField
          v-model="promptName"
          label="名称 *"
          placeholder="例如：论文总结助手"
        />
        <CgSelect
          v-model="promptCategory"
          label="分类"
          :options="PROMPT_CATEGORIES"
        />
        <CgTextField
          v-model="promptTagsInput"
          label="标签"
          placeholder="逗号分隔"
        />
      </div>

      <div class="cg-editor-page__body">
        <CgMarkdownSplit
          v-model="editingContent"
          placeholder="输入 Markdown + LaTeX..."
          :render-html="renderResult.html"
          :split-ratio="editorSplitRatio"
          :warning="renderResult.unclosedFormula ? '含有未闭合的 $ 公式符号' : ''"
          @update:splitRatio="editorSplitRatio = $event"
        />
      </div>

      <div class="cg-editor-page__footer">
        <div v-if="statusMessage" class="cg-editor-page__status" aria-live="polite">
          <span class="cg-status-dot" />
          <span>{{ statusMessage }}</span>
        </div>
        <CgButton
          v-if="isEditingPrompt"
          class="cg-editor-page__delete"
          variant="danger"
          @click="confirmDelete.open = true"
        >
          删除
        </CgButton>
        <div class="cg-editor-page__footer-actions">
          <CgButton @click="closeEditor">取消</CgButton>
          <CgButton variant="primary" @click="savePrompt()">
            {{ isEditingPrompt ? '保存修改' : '保存提示词' }}
          </CgButton>
        </div>
      </div>

      <CgConfirmDialog
        :open="confirmDelete.open"
        title="删除提示词"
        :message="`确认删除「${promptName || '未命名'}」？此操作不可撤销。`"
        confirm-label="确认删除"
        danger
        @cancel="confirmDelete.open = false"
        @confirm="handleDelete()"
      />
    </div>
  </div>
</template>
