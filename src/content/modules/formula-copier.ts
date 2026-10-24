// 公式点击复制模块

import type { FormulaCopyFormat, SiteAdapter } from '@/main/types'
import {
  appendFormulaHistory,
  readSettings
} from '@/main/storage'
import {
  copyTextToClipboard,
  isElementVisibleInViewport,
  normalizeFormulaCopyFormat
} from '@/main/utils'
import { extractLatexSource, findFormulaElement } from './formula-source'

// 动态加载 tex-to-unicode 转换（从全局读取，由扩展 web_accessible 注入）
type TexToUnicodeConverter = { convertLatexToUnicodeMath: (latex: string) => string }
declare global {
  // eslint-disable-next-line no-var
  var texToUnicodeMath: TexToUnicodeConverter | undefined
}

let enabled = false
let copyFormat: FormulaCopyFormat = 'latex-source'
let selectedElement: Element | null = null
let hoveredElement: Element | null = null
let pendingHoverTarget: Element | null = null
let hoverFrame: number | null = null
let selectionFlashTimer: number | null = null

function shouldIgnorePath(path: EventTarget[]): boolean {
  return path.some((item) => {
    if (!(item instanceof Element)) return false
    if (item.id === 'chatgo-floating-host' || item.id === 'chatgo-editor-host') return true
    return item.classList.contains('chatgo-formula-feedback')
      || item.classList.contains('chatgo-floating-root')
      || item.classList.contains('chatgo-editor-root')
      || item.classList.contains('chatgo-branch-root')
  })
}

function clearSelection(): void {
  if (selectionFlashTimer) {
    window.clearTimeout(selectionFlashTimer)
    selectionFlashTimer = null
  }
  if (selectedElement) {
    selectedElement.classList.remove('chatgo-formula-selected')
    selectedElement = null
  }
}

function clearHover(): void {
  if (hoveredElement) {
    hoveredElement.classList.remove('chatgo-formula-hover')
    hoveredElement = null
  }
}

function updateHover(target: Element | null): void {
  if (hoveredElement === target) return
  clearHover()
  if (!target || target === selectedElement) return
  hoveredElement = target
  hoveredElement.classList.add('chatgo-formula-hover')
}

function scheduleHoverUpdate(target: Element | null): void {
  pendingHoverTarget = target
  if (hoverFrame) return
  hoverFrame = window.requestAnimationFrame(() => {
    hoverFrame = null
    updateHover(pendingHoverTarget)
  })
}

function flashSelection(target: Element): void {
  clearSelection()
  updateHover(null)
  selectedElement = target
  selectedElement.classList.add('chatgo-formula-selected')
  selectionFlashTimer = window.setTimeout(() => {
    if (selectedElement === target) {
      selectedElement.classList.remove('chatgo-formula-selected')
      selectedElement = null
    }
    if (target.isConnected && target.matches(':hover')) updateHover(target)
    selectionFlashTimer = null
  }, 220)
}

function clearFeedback(): void {
  document.querySelectorAll('.chatgo-formula-feedback').forEach((el) => el.remove())
}

function showCopyFeedback(element: Element, message: string): void {
  const rect = element.getBoundingClientRect()
  const feedback = document.createElement('div')
  feedback.textContent = message
  feedback.className = 'chatgo-formula-feedback'
  ;(document.body ?? document.documentElement).appendChild(feedback)
  feedback.style.left = `${rect.left + rect.width / 2 - feedback.offsetWidth / 2}px`
  feedback.style.top = `${Math.max(rect.top - feedback.offsetHeight - 8, 12)}px`
  window.requestAnimationFrame(() => feedback.classList.add('visible'))
  window.setTimeout(() => {
    feedback.classList.remove('visible')
    window.setTimeout(() => feedback.remove(), 300)
  }, 1500)
}

function convertLatexToUnicodeMath(latex: string): string | null {
  if (!texToUnicodeMath?.convertLatexToUnicodeMath) return null
  try {
    const converter = texToUnicodeMath
    if (!converter) return null
    const result = converter.convertLatexToUnicodeMath(latex)
    return typeof result === 'string' ? result.trim() || null : null
  } catch {
    return null
  }
}

interface CopyPayload {
  text?: string
  latexSource?: string
  successMessage?: string
  errorMessage?: string
}

function getCopyPayload(target: Element): CopyPayload {
  const latex = extractLatexSource(target)
  if (!latex) return { errorMessage: '未识别到 LaTeX' }

  if (copyFormat === 'unicode-math') {
    const unicode = convertLatexToUnicodeMath(latex)
    if (!unicode) return { errorMessage: 'LaTeX 转 UnicodeMath 失败' }
    return { text: unicode, latexSource: latex, successMessage: 'UnicodeMath 已复制' }
  }
  if (copyFormat === 'latex') {
    return { text: `$${latex}$`, latexSource: latex, successMessage: 'LaTeX（含 $）已复制' }
  }
  return { text: latex, latexSource: latex, successMessage: 'LaTeX 已复制' }
}

async function processFormulaClick(target: Element): Promise<void> {
  flashSelection(target)
  const payload = getCopyPayload(target)
  if (payload.text) {
    await copyTextToClipboard(payload.text)
    try {
      await appendFormulaHistory({
        text: payload.text,
        latexSource: payload.latexSource ?? '',
        format: copyFormat,
        copiedAt: Date.now(),
        sourceTitle: document.title,
        sourceUrl: window.location.href
      })
    } catch (error) {
      console.warn('[ChatGo] 公式历史保存失败。', error)
    }
    showCopyFeedback(target, payload.successMessage ?? '已复制')
  } else {
    showCopyFeedback(target, payload.errorMessage ?? '复制失败')
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (shouldIgnorePath(event.composedPath())) {
    clearSelection()
    clearHover()
    return
  }
  const formulaElement = findFormulaElement(event.composedPath())
  if (!formulaElement) {
    clearSelection()
    clearHover()
    return
  }
  event.preventDefault()
  event.stopPropagation()
  processFormulaClick(formulaElement).catch((error) => {
    console.error('[ChatGo] 公式复制失败。', error)
    clearSelection()
  })
}

function onDocumentMouseMove(event: MouseEvent): void {
  if (shouldIgnorePath(event.composedPath())) {
    scheduleHoverUpdate(null)
    return
  }
  scheduleHoverUpdate(findFormulaElement(event.composedPath()))
}

function onDocumentMouseOut(event: MouseEvent): void {
  if (!event.relatedTarget) {
    pendingHoverTarget = null
    if (hoverFrame) {
      window.cancelAnimationFrame(hoverFrame)
      hoverFrame = null
    }
    clearHover()
  }
}

// 注入样式
function injectStyles(): void {
  if (document.getElementById('chatgo-formula-copier-styles')) return
  const style = document.createElement('style')
  style.id = 'chatgo-formula-copier-styles'
  style.textContent = `
    /* 将边框画在元素内部，避免被公式的 overflow 滚动容器裁掉左右两侧。 */
    .chatgo-formula-hover { outline: 2px solid #3B82F6 !important; outline-offset: -2px !important; cursor: pointer; }
    .chatgo-formula-selected { outline: 2px solid #0A0A0A !important; outline-offset: -2px !important; }
    .chatgo-formula-feedback {
      position: fixed; z-index: 2147483647; padding: 6px 12px; border-radius: 8px;
      background: #0A0A0A; color: #FFFFFF; font-size: 13px; font-family: system-ui, sans-serif;
      opacity: 0; transition: opacity 0.2s; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .chatgo-formula-feedback.visible { opacity: 1; }
  `
  ;(document.head ?? document.documentElement).appendChild(style)
}

function removeStyles(): void {
  document.getElementById('chatgo-formula-copier-styles')?.remove()
}

export const formulaCopier = {
  setCopyFormat(format: FormulaCopyFormat): void {
    copyFormat = normalizeFormulaCopyFormat(format)
  },

  enable(_adapter: SiteAdapter): void {
    if (enabled) return
    enabled = true
    injectStyles()
    document.addEventListener('click', onDocumentClick, true)
    document.addEventListener('mousemove', onDocumentMouseMove, true)
    document.addEventListener('mouseout', onDocumentMouseOut, true)
    console.log('[ChatGo] 公式复制已开启。')
  },

  disable(): void {
    if (!enabled) return
    enabled = false
    document.removeEventListener('click', onDocumentClick, true)
    document.removeEventListener('mousemove', onDocumentMouseMove, true)
    document.removeEventListener('mouseout', onDocumentMouseOut, true)
    if (hoverFrame) {
      window.cancelAnimationFrame(hoverFrame)
      hoverFrame = null
    }
    pendingHoverTarget = null
    clearSelection()
    clearHover()
    clearFeedback()
    removeStyles()
    console.log('[ChatGo] 公式复制已关闭。')
  },

  async syncSettings(): Promise<void> {
    const settings = await readSettings()
    copyFormat = settings.formulaCopyFormat
  },

  isElementVisible: isElementVisibleInViewport
}
