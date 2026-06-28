<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  label: string
  hint?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
function toggle(): void {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <label class="cg-toggle">
    <span class="cg-toggle__text">
      <strong>{{ label }}</strong>
      <small v-if="hint">{{ hint }}</small>
    </span>
    <button
      type="button"
      class="cg-toggle__track"
      :class="{ 'cg-toggle__track--on': modelValue }"
      role="switch"
      :aria-checked="modelValue"
      @click="toggle"
    >
      <span class="cg-toggle__thumb" />
    </button>
  </label>
</template>

<style scoped>
.cg-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  cursor: pointer;
}
.cg-toggle__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cg-toggle__text strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--cg-text);
}
.cg-toggle__text small {
  font-size: 12px;
  color: var(--cg-text-muted);
}
.cg-toggle__track {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: var(--cg-gray-200);
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease;
  flex-shrink: 0;
}
.cg-toggle__track--on {
  background: var(--cg-accent);
}
.cg-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--cg-white);
  box-shadow: 0 1px 3px rgba(11, 15, 25, 0.2);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cg-toggle__track--on .cg-toggle__thumb {
  transform: translateX(20px);
}
</style>
