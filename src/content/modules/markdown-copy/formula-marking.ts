import type { MarkdownFormulaWrapMode } from '@/main/types'
import { isDisplayFormula, extractLatexSource } from '../formula-source'
import {
  FORMULA_DISPLAY_ATTR,
  FORMULA_MARKDOWN_ATTR,
  FORMULA_MARK_ID_ATTR,
  FORMULA_SELECTOR
} from './constants'

function formatFormulaMarkdown(latex: string, display: boolean, wrapMode: MarkdownFormulaWrapMode): string {
  if (wrapMode === 'bare') return latex
  return display ? `$$${latex}$$` : `$${latex}$`
}

function getFormulaMarkRoot(element: Element | null): Element | null {
  if (!element) return null

  const katex = element.closest('.katex')
  if (katex) return katex.closest('.katex-display') ?? katex

  return element.closest("mjx-container, cib-math, math, [role='math']")
}

export function markClonedFormulas(
  container: HTMLElement,
  wrapMode: MarkdownFormulaWrapMode,
  nextMarkId: () => string
): void {
  const candidates = new Set<Element>()
  container.querySelectorAll(FORMULA_SELECTOR).forEach((el) => {
    const formulaRoot = getFormulaMarkRoot(el)
    if (formulaRoot && container.contains(formulaRoot)) candidates.add(formulaRoot)
  })

  candidates.forEach((formula) => {
    if (!formula.isConnected && !container.contains(formula)) return
    const latex = extractLatexSource(formula)
    if (!latex) return
    const display = isDisplayFormula(formula)
    const markdown = formatFormulaMarkdown(latex, display, wrapMode)
    const marker = document.createElement(display ? 'div' : 'span')
    marker.setAttribute(FORMULA_MARKDOWN_ATTR, markdown)
    marker.setAttribute(FORMULA_MARK_ID_ATTR, nextMarkId())
    marker.setAttribute(FORMULA_DISPLAY_ATTR, display ? '1' : '0')
    // Turndown 会在规则匹配前跳过空节点；保留文本可确保公式规则被调用。
    marker.textContent = markdown
    formula.replaceWith(marker)
  })
}
