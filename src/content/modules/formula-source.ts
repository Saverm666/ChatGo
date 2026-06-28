// 公式 LaTeX 源码提取：从渲染容器中还原原始 LaTeX
// 移植自 ChatGPT-Voyager 的 extractLatexSourceFromContainer

// 从渲染容器中提取 LaTeX 源码
export function extractLatexSource(container: Element | null): string | null {
  if (!(container instanceof Element)) return null

  // 1. 优先从 MathML annotation 读取
  const annotation = container.querySelector(
    'annotation[encoding="application/x-tex"], annotation[encoding="text/x-latex"]'
  )
  if (annotation) {
    const text = annotation.textContent?.trim().replace(/\s*\\tag\{.*\}/, '').trim()
    if (text) return text
  }

  // 2. Copilot cib-math 的 raw 属性
  let current: Element | null = container
  while (current instanceof Element) {
    const rootNode: Node | null = current.getRootNode()
    if (rootNode instanceof ShadowRoot) {
      const host: Element | null = rootNode.host
      if (host && host.tagName === 'CIB-MATH' && host.hasAttribute('raw')) {
        const raw = host.getAttribute('raw')?.trim()
        if (raw) return raw
      }
      current = host
    } else {
      current = null
    }
  }

  // 3. 从 <math> 元素的文本节点读取
  const mathElement = container.querySelector("math, [role='math']")
  if (mathElement) {
    for (const child of mathElement.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE) continue
      const latex = (child.textContent ?? '').trim()
      if (
        latex.length > 1 &&
        (latex.includes('\\') || latex.includes('^') || latex.includes('_') || latex.includes('{'))
      ) {
        return latex
      }
    }
  }

  return null
}

// 查找点击路径中的公式元素
export function findFormulaElement(path: EventTarget[]): Element | null {
  for (const item of path) {
    if (!(item instanceof Element)) continue
    if (
      item.classList.contains('katex') ||
      item.classList.contains('katex-display') ||
      item.matches?.('mjx-container')
    ) {
      return item
    }
  }
  return null
}

// 判断元素是否为公式元素
export function isFormulaElement(element: Element | null): boolean {
  if (!(element instanceof Element)) return false
  return Boolean(
    element.matches(
      ".katex, .katex-display, .katex-mathml, mjx-container, math, [role='math'], cib-math"
    ) ||
      (element.tagName === 'SPAN' &&
        Boolean(
          element.querySelector?.(
            "annotation[encoding='application/x-tex'], annotation[encoding='text/x-latex']"
          )
        ))
  )
}

// 判断是否为块级公式
export function isDisplayFormula(element: Element | null): boolean {
  if (!(element instanceof Element)) return false
  if (element.matches('.katex-display')) return true
  const display = window.getComputedStyle(element).display
  return display === 'block' || display === 'flex'
}
