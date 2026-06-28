<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { Tag, ChevronDown, Check } from '@lucide/vue'

const props = defineProps<{
  modelValue: string
  options: readonly string[]
  label: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function selectOption(option: string): void {
  emit('update:modelValue', option)
  open.value = false
}

function toggle(): void {
  open.value = !open.value
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    open.value = false
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onKeydown, true)
}

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <label
    ref="root"
    class="cg-field cg-select"
    :class="{ 'cg-select--open': open }"
  >
    <span>{{ label }}</span>
    <button
      class="cg-select__trigger"
      type="button"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      @click="toggle"
    >
      <Tag aria-hidden="true" :size="14" :stroke-width="2.2" class="cg-select__prefix" />
      <span
        class="cg-select__value"
        :class="{ 'cg-select__value--placeholder': !modelValue }"
      >
        {{ modelValue || placeholder || '请选择' }}
      </span>
      <ChevronDown aria-hidden="true" :size="16" :stroke-width="2.4" class="cg-select__chevron" />
    </button>
    <Transition name="cg-select-pop">
      <div v-if="open" class="cg-select__popover" role="listbox">
        <button
          v-for="option in props.options"
          :key="option"
          class="cg-select__option"
          :class="{ 'cg-select__option--active': modelValue === option }"
          type="button"
          role="option"
          :aria-selected="modelValue === option"
          @click="selectOption(option)"
        >
          <span>{{ option }}</span>
          <Check v-if="modelValue === option" aria-hidden="true" :size="14" :stroke-width="2.6" />
        </button>
      </div>
    </Transition>
  </label>
</template>
