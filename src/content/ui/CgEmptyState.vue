<script setup lang="ts">
import { FileText } from '@lucide/vue'

defineProps<{
  compact?: boolean
}>()
</script>

<template>
  <div class="cg-empty-state" :class="{ 'cg-empty-state--compact': compact }">
    <FileText v-if="!compact" aria-hidden="true" :size="38" :stroke-width="1.9" />
    <p><slot /></p>
  </div>
</template>
