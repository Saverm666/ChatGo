<script setup lang="ts">
import { History } from '@lucide/vue'

defineProps<{
  savedAt: number
}>()

defineEmits<{
  restore: []
  discard: []
}>()

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="cg-draft-bar">
    <span class="cg-draft-bar__lead">
      <History aria-hidden="true" :size="13" :stroke-width="2.2" />
      <span>草稿已保存于 {{ formatTime(savedAt) }}</span>
    </span>
    <span class="cg-draft-bar__actions">
      <button class="cg-draft-bar__btn" type="button" @click="$emit('restore')">恢复</button>
      <button class="cg-draft-bar__btn cg-draft-bar__btn--danger" type="button" @click="$emit('discard')">丢弃</button>
    </span>
  </div>
</template>
