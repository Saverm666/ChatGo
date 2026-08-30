<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ source: string }>()

const root = ref<HTMLElement | null>(null)
const html = ref('')
let observer: IntersectionObserver | null = null
let renderFormula: ((source: string) => string) | null = null
let loadPromise: Promise<void> | null = null

async function renderWhenNeeded(): Promise<void> {
  if (!props.source || html.value || loadPromise) return loadPromise ?? Promise.resolve()
  loadPromise = (async () => {
    const [{ renderFormulaPreview }, { default: katexStyles }] = await Promise.all([
      import('@/content/formula-preview'),
      import('katex/dist/katex.min.css?inline')
    ])
    if (!root.value) return
    const renderRoot = root.value.getRootNode()
    if (renderRoot instanceof ShadowRoot && !renderRoot.querySelector('#chatgo-katex-preview-styles')) {
      const style = document.createElement('style')
      style.id = 'chatgo-katex-preview-styles'
      style.textContent = katexStyles
      renderRoot.appendChild(style)
    }
    renderFormula = renderFormulaPreview
    html.value = renderFormulaPreview(props.source)
  })().finally(() => {
    loadPromise = null
  })
  return loadPromise
}

watch(
  () => props.source,
  (source) => {
    if (renderFormula) html.value = renderFormula(source)
  }
)

onMounted(() => {
  if (!root.value || typeof IntersectionObserver === 'undefined') {
    renderWhenNeeded().catch(() => {})
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    observer = null
    renderWhenNeeded().catch(() => {})
  }, { rootMargin: '80px' })
  observer.observe(root.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="root">
    <div v-if="html" v-html="html" />
    <span v-else>{{ source }}</span>
  </div>
</template>
