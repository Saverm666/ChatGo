<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  placeholder?: string
  multiline?: boolean
  rows?: number
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="cg-field">
    <span>{{ label }}</span>
    <textarea
      v-if="multiline"
      :value="modelValue"
      :rows="rows ?? 8"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
