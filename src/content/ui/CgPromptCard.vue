<script setup lang="ts">
import { Copy, Pencil, Pin, Trash2 } from '@lucide/vue'
import type { SavedPrompt } from '@/main/types'
import { truncateText } from '@/main/utils'
import CgIconButton from './CgIconButton.vue'

defineProps<{
  prompt: SavedPrompt
  category: string
}>()

defineEmits<{
  pin: []
  copy: []
  edit: []
  delete: []
}>()
</script>

<template>
  <li class="cg-prompt-card">
    <div class="cg-prompt-card__head">
      <div class="cg-prompt-title">
        <span class="cg-prompt-category">{{ category }}</span>
        <h3>{{ prompt.name || '未命名提示词' }}</h3>
      </div>
      <div class="cg-card-actions">
        <CgIconButton :label="prompt.pinned ? '取消置顶' : '置顶'" :active="prompt.pinned" @click="$emit('pin')">
          <Pin aria-hidden="true" :size="17" :stroke-width="2" :fill="prompt.pinned ? 'currentColor' : 'none'" />
        </CgIconButton>
        <CgIconButton label="复制" @click="$emit('copy')">
          <Copy aria-hidden="true" :size="17" :stroke-width="2" />
        </CgIconButton>
        <CgIconButton label="编辑" @click="$emit('edit')">
          <Pencil aria-hidden="true" :size="17" :stroke-width="2" />
        </CgIconButton>
        <CgIconButton label="删除" danger @click="$emit('delete')">
          <Trash2 aria-hidden="true" :size="17" :stroke-width="2" />
        </CgIconButton>
      </div>
    </div>
    <button
      class="cg-prompt-card__content"
      type="button"
      :aria-label="`复制「${prompt.name || '未命名提示词'}」内容`"
      @click="$emit('copy')"
    >{{ truncateText(prompt.content, 120) }}</button>
    <div class="cg-prompt-card__meta">
      <div v-if="prompt.tags?.length" class="cg-tag-row">
        <span v-for="tag in (prompt.tags ?? []).slice(0, 4)" :key="tag" class="cg-tag">{{ tag }}</span>
      </div>
      <span class="cg-usage">{{ prompt.usedCount ?? 0 }} 次使用</span>
    </div>
  </li>
</template>
