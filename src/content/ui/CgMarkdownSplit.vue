<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  renderHtml: string
  splitRatio: number
  placeholder?: string
  warning?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:splitRatio': [value: number]
}>()

let gutterStartX = 0
let gutterStartRatio = 0.5

function onGutterDown(event: PointerEvent): void {
  const el = event.currentTarget as HTMLElement
  gutterStartX = event.clientX
  gutterStartRatio = props.splitRatio
  const parent = el.parentElement
  if (!parent) return
  const parentWidth = parent.clientWidth
  const onMove = (e: PointerEvent) => {
    const delta = e.clientX - gutterStartX
    const next = gutterStartRatio + delta / parentWidth
    emit('update:splitRatio', Math.min(0.7, Math.max(0.3, next)))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div
    class="cg-markdown-split"
    :style="{ '--split-left': `${splitRatio}fr`, '--split-right': `${1 - splitRatio}fr` }"
  >
    <div class="cg-markdown-split__source">
      <textarea
        :value="modelValue"
        :placeholder="placeholder"
        spellcheck="false"
        @input="onInput"
      />
    </div>
    <div
      class="cg-markdown-split__gutter"
      role="separator"
      aria-label="拖动调整左右面板宽度"
      @pointerdown.prevent="onGutterDown"
    />
    <div class="cg-markdown-split__render">
      <div class="cg-markdown-split__render-inner" v-html="renderHtml" />
      <div v-if="warning" class="cg-markdown-split__render-warn">{{ warning }}</div>
    </div>
  </div>
</template>
