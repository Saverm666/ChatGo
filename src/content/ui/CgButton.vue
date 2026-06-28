<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'danger'
  type?: 'button' | 'submit'
}>()
</script>

<template>
  <button
    :class="variant === 'primary' ? 'cg-primary-btn' : ['cg-secondary-btn', { 'cg-secondary-btn--danger': variant === 'danger' }]"
    :type="type ?? 'button'"
  >
    <slot />
  </button>
</template>
