<script setup lang="ts">
import { ref } from 'vue'
import { Funnel } from '@lucide/vue'

const props = defineProps<{
  modelValue: string
  options: string[]
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)

function selectOption(option: string): void {
  emit('update:modelValue', option)
  open.value = false
}
</script>

<template>
  <div class="cg-filter-menu" :class="{ 'cg-filter-menu--open': open }">
    <button
      class="cg-filter-trigger"
      type="button"
      :aria-label="label"
      :title="label"
      :aria-expanded="open"
      @click="open = !open"
    >
      <slot name="icon">
        <Funnel aria-hidden="true" :size="17" :stroke-width="2" />
      </slot>
    </button>
    <div v-if="open" class="cg-filter-popover" role="menu">
      <button
        v-for="option in props.options"
        :key="option"
        class="cg-filter-option"
        :class="{ 'cg-filter-option--active': modelValue === option }"
        type="button"
        role="menuitemradio"
        :aria-checked="modelValue === option"
        @click="selectOption(option)"
      >
        {{ option }}
      </button>
    </div>
  </div>
</template>
