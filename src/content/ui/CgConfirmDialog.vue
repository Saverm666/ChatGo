<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Transition name="cg-confirm">
    <div v-if="open" class="cg-confirm-backdrop" @pointerdown="$emit('cancel')">
      <div class="cg-confirm" role="alertdialog" @pointerdown.stop>
        <h3 class="cg-confirm__title">{{ title }}</h3>
        <p class="cg-confirm__message">{{ message }}</p>
        <div class="cg-confirm__actions">
          <button class="cg-secondary-btn" type="button" @click="$emit('cancel')">
            {{ cancelLabel ?? '取消' }}
          </button>
          <button
            :class="danger ? 'cg-secondary-btn cg-secondary-btn--danger' : 'cg-primary-btn'"
            type="button"
            @click="$emit('confirm')"
          >
            {{ confirmLabel ?? '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
