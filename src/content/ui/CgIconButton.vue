<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
  danger?: boolean
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="cg-icon-btn"
    :class="{ 'cg-icon-btn--active': active, 'cg-icon-btn--danger': danger }"
    type="button"
    :aria-label="label"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
