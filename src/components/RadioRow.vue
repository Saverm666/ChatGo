<script setup lang="ts">
defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  name: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
function select(value: string): void {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="cg-radio-group">
    <label
      v-for="opt in options"
      :key="opt.value"
      class="cg-radio"
      :class="{ 'cg-radio--checked': modelValue === opt.value }"
    >
      <input
        type="radio"
        :name="name"
        :value="opt.value"
        :checked="modelValue === opt.value"
        @change="select(opt.value)"
      />
      <span class="cg-radio__check" />
      <span class="cg-radio__label">{{ opt.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.cg-radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 4px;
}
.cg-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--cg-radius-sm);
  cursor: pointer;
  transition: background 0.12s ease;
}
.cg-radio:hover {
  background: var(--cg-bg-soft);
}
.cg-radio input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.cg-radio__check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--cg-gray-300);
  position: relative;
  transition: border-color 0.15s ease;
  flex-shrink: 0;
}
.cg-radio__check::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cg-accent);
  transform: translate(-50%, -50%) scale(0);
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cg-radio--checked .cg-radio__check {
  border-color: var(--cg-accent);
}
.cg-radio--checked .cg-radio__check::after {
  transform: translate(-50%, -50%) scale(1);
}
.cg-radio__label {
  font-size: 13px;
  color: var(--cg-text-soft);
}
.cg-radio--checked .cg-radio__label {
  color: var(--cg-text);
  font-weight: 600;
}
</style>
