// 公式 LaTeX 源码提取：兼容 KaTeX、MathJax、原生 MathML 和常见站点属性。

const TEX_ANNOTATION_SELECTOR =
  'annotation[encoding="application/x-tex"], annotation[encoding="text/x-latex"]'
const FORMULA_SELECTOR =
  ".katex, .katex-display, .katex-mathml, mjx-container, math, [role='math'], cib-math"
const SOURCE_ATTRIBUTES = [
  'data-latex', 'data-tex', 'data-formula', 'data-math', 'data-raw', 'raw',
  // 2026-09 登录态 ChatGPT 把原始 LaTeX 放在包裹 KaTeX 的
  // <span class="block" data-math-source="\mathcal{L} = ..."> 上。
  'data-math-source'
] as const

export const FORMULA_SOURCE_ATTRIBUTES: readonly string[] = SOURCE_ATTRIBUTES

// 站点常把原始 LaTeX 放在公式**祖先**元素的属性上而不是公式自身
// （ChatGPT 登录态就是 <span data-math-source><span class="katex-display">…，
// 属性在父级，必须向上看几层）。
const SOURCE_ANCESTOR_DEPTH = 3

/** 属性取源顺序：公式自身 → 至多 3 层祖先 → 容器内其它公式节点。 */
export function sourceAttributeCandidates(container: Element): Element[] {
  const candidates: Element[] = [container]
  let ancestor: Element | null = container.parentElement
  for (let depth = 0; ancestor && depth < SOURCE_ANCESTOR_DEPTH; depth += 1) {
    candidates.push(ancestor)
    ancestor = ancestor.parentElement
  }
  candidates.push(...Array.from(container.querySelectorAll(FORMULA_SELECTOR)))
  return candidates
}

const MATH_OPERATOR_LATEX: Record<string, string> = {
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow',
  '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
  '≈': '\\approx', '∼': '\\sim', '≠': '\\ne', '≤': '\\le', '≥': '\\ge',
  '±': '\\pm', '∓': '\\mp', '×': '\\times', '·': '\\cdot', '÷': '\\div', '−': '-',
  '∞': '\\infty', '∑': '\\sum', '∏': '\\prod', '∫': '\\int',
  '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
  '∂': '\\partial', '∇': '\\nabla', '∈': '\\in', '∉': '\\notin',
  '⊂': '\\subset', '⊆': '\\subseteq', '∪': '\\cup', '∩': '\\cap',
  '∅': '\\emptyset', '∧': '\\land', '∨': '\\lor', '¬': '\\neg',
  '≡': '\\equiv', '∣': '\\mid', '∥': '\\Vert',
  '⟨': '\\langle', '⟩': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor',
  '⌈': '\\lceil', '⌉': '\\rceil', '′': '\\prime',
  '…': '\\cdots', '⋯': '\\cdots', '⋅': '\\cdot'
}

const GREEK_LATEX: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
  'ε': '\\varepsilon', 'ϵ': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta',
  'θ': '\\theta', 'ϑ': '\\vartheta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi',
  'π': '\\pi', 'ϖ': '\\varpi', 'ρ': '\\rho', 'ϱ': '\\varrho',
  'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau', 'υ': '\\upsilon',
  'φ': '\\varphi', 'ϕ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
  'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Υ': '\\Upsilon',
  'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega'
}

function normalizeLatexCandidate(value: string | null | undefined): string | null {
  let text = String(value ?? '').replace(/[\u200b-\u200f\u2060\ufeff]/g, '').trim()
  if (!text) return null
  if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4) {
    text = text.slice(2, -2).trim()
  } else if (text.startsWith('$') && text.endsWith('$') && text.length > 2) {
    text = text.slice(1, -1).trim()
  } else if (
    ((text.startsWith('\\(') && text.endsWith('\\)')) ||
      (text.startsWith('\\[') && text.endsWith('\\]'))) && text.length > 4
  ) {
    text = text.slice(2, -2).trim()
  }
  text = text.replace(/\s*\\tag\{[^{}]*\}\s*$/, '').trim()
  return text || null
}

function escapeLatexText(value: string): string {
  return value.replace(/([#$%&_{}])/g, '\\$1')
}

function tokenToLatex(value: string, operator = false): string {
  const text = value.replace(/\u00a0/g, ' ').trim()
  if (!text) return ''
  if (MATH_OPERATOR_LATEX[text]) return MATH_OPERATOR_LATEX[text]
  if (GREEK_LATEX[text]) return GREEK_LATEX[text]
  if (!operator) return text
  const tokens = Array.from(text)
    .map((character) => MATH_OPERATOR_LATEX[character] ?? GREEK_LATEX[character] ?? character)
  return tokens.some((token) => token.startsWith('\\')) ? tokens.join(' ') : tokens.join('')
}

function elementChildren(element: Element): Element[] {
  return Array.from(element.children)
}

function childrenToLatex(element: Element): string {
  return elementChildren(element).map(mathMlElementToLatex).filter(Boolean).join(' ')
}

function childLatex(element: Element, index: number): string {
  const child = elementChildren(element)[index]
  return child ? mathMlElementToLatex(child) : ''
}

function groupLatex(value: string): string {
  return `{${value.trim()}}`
}

function normalizeMathMlLatex(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:.!?)\]}])/g, '$1')
    .replace(/([(\[{])\s+/g, '$1')
    .replace(/\s*([_^])\s*/g, '$1')
    .replace(/\s*([=<>])\s*/g, ' $1 ')
    .trim()
}

/** 新版站点常移除 TeX annotation，只留下 MathML；这里把常见 MathML 还原为 LaTeX。 */
export function mathMlElementToLatex(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const children = elementChildren(element)
  let result = ''

  switch (tag) {
    case 'annotation':
      result = element.textContent ?? ''
      break
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'mphantom':
    case 'semantics':
      result = children
        .filter((child) => child.tagName.toLowerCase() !== 'annotation')
        .map(mathMlElementToLatex).filter(Boolean).join(' ')
      break
    case 'mi':
    case 'mn':
      result = tokenToLatex(element.textContent ?? '')
      break
    case 'mo':
      result = tokenToLatex(element.textContent ?? '', true)
      break
    case 'mtext':
      result = `\\text{${escapeLatexText(element.textContent ?? '')}}`
      break
    case 'msub':
      result = `${childLatex(element, 0)}_${groupLatex(childLatex(element, 1))}`
      break
    case 'msup':
      result = `${childLatex(element, 0)}^${groupLatex(childLatex(element, 1))}`
      break
    case 'msubsup':
      result = `${childLatex(element, 0)}_${groupLatex(childLatex(element, 1))}^${groupLatex(childLatex(element, 2))}`
      break
    case 'mfrac':
      result = `\\frac${groupLatex(childLatex(element, 0))}${groupLatex(childLatex(element, 1))}`
      break
    case 'msqrt':
      result = `\\sqrt${groupLatex(childrenToLatex(element))}`
      break
    case 'mroot':
      result = `\\sqrt[${childLatex(element, 1)}]${groupLatex(childLatex(element, 0))}`
      break
    case 'munder':
      result = `${childLatex(element, 0)}_${groupLatex(childLatex(element, 1))}`
      break
    case 'mover': {
      const base = childLatex(element, 0)
      const over = childLatex(element, 1)
      if (over === '¯' || over === '‾') result = `\\overline${groupLatex(base)}`
      else if (over === '^' || over === 'ˆ') result = `\\hat${groupLatex(base)}`
      else result = `\\overset${groupLatex(over)}${groupLatex(base)}`
      break
    }
    case 'munderover':
      result = `${childLatex(element, 0)}_${groupLatex(childLatex(element, 1))}^${groupLatex(childLatex(element, 2))}`
      break
    case 'mfenced': {
      const open = element.getAttribute('open') ?? '('
      const close = element.getAttribute('close') ?? ')'
      const separator = (element.getAttribute('separators') ?? ',')[0] ?? ','
      result = `${open}${children.map(mathMlElementToLatex).join(`${separator} `)}${close}`
      break
    }
    case 'mtable':
      result = `\\begin{matrix}${children.map(mathMlElementToLatex).join(' \\\\ ')}\\end{matrix}`
      break
    case 'mtr':
      result = children.map(mathMlElementToLatex).join(' & ')
      break
    case 'mtd':
      result = childrenToLatex(element)
      break
    case 'mspace':
      result = '\\,'
      break
    default:
      result = children.length ? childrenToLatex(element) : tokenToLatex(element.textContent ?? '')
  }

  return normalizeMathMlLatex(result)
}

const KATEX_IGNORED_CLASSES = [
  'strut', 'pstrut', 'mspace', 'vlist-s', 'frac-line', 'hide-tail'
]

function hasAnyClass(element: Element, classNames: string[]): boolean {
  return classNames.some((className) => element.classList.contains(className))
}

function getKatexVListEntries(element: Element): HTMLElement[] {
  const vlist = element.querySelector<HTMLElement>(
    ':scope > .vlist-t > .vlist-r:first-child > .vlist, :scope > .vlist-t2 > .vlist-r:first-child > .vlist'
  )
  if (!vlist) return []
  return Array.from(vlist.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement) || !child.style.top) return false
    return !child.querySelector(':scope > .frac-line')
  })
}

function katexScriptToLatex(element: Element): string {
  const entries = getKatexVListEntries(element)
    .map((entry) => ({
      top: Number.parseFloat(entry.style.top),
      latex: katexHtmlNodeToLatex(entry)
    }))
    .filter((entry) => Number.isFinite(entry.top) && entry.latex)
    .sort((a, b) => a.top - b.top)
  if (entries.length === 0) return ''
  if (entries.length === 1) {
    const entry = entries[0]
    const isSubscript = element.firstElementChild?.classList.contains('vlist-t2') ?? false
    return isSubscript ? `_${groupLatex(entry.latex)}` : `^${groupLatex(entry.latex)}`
  }
  const superscript = entries[0]
  const subscript = entries[entries.length - 1]
  return `_${groupLatex(subscript.latex)}^${groupLatex(superscript.latex)}`
}

function katexFractionToLatex(element: Element): string {
  const vlist = element.querySelector<HTMLElement>(
    ':scope > .vlist-t > .vlist-r:first-child > .vlist, :scope > .vlist-t2 > .vlist-r:first-child > .vlist'
  )
  if (!vlist) return ''
  const entries = Array.from(vlist.children)
    .filter((child): child is HTMLElement => {
      return child instanceof HTMLElement && Boolean(child.style.top) && !child.querySelector(':scope > .frac-line')
    })
    .map((entry) => ({
      element: entry,
      top: Number.parseFloat(entry.style.top),
      latex: katexHtmlNodeToLatex(entry)
    }))
    .filter((entry) => Number.isFinite(entry.top))
    .sort((a, b) => a.top - b.top)
  if (entries.length < 2) return ''
  const command = entries.every((entry) => !entry.element.querySelector(':scope > .sizing'))
    ? '\\dfrac'
    : '\\frac'
  return `${command}${groupLatex(entries[0].latex)}${groupLatex(entries[entries.length - 1].latex)}`
}

function katexAccentToLatex(element: Element): string {
  const vlist = element.querySelector<HTMLElement>(
    ':scope > .vlist-t > .vlist-r:first-child > .vlist, :scope > .vlist-t2 > .vlist-r:first-child > .vlist'
  )
  if (!vlist) return ''
  const entries = Array.from(vlist.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && Boolean(child.style.top)
  )
  const accentEntry = entries.find(
    (entry) => entry.matches('.svg-align') || Boolean(entry.querySelector('.accent-body, .svg-align'))
  )
  const baseEntry = entries.find((entry) => entry !== accentEntry)
  if (!baseEntry) return ''
  const base = katexHtmlNodeToLatex(baseEntry)
  const accentBody = accentEntry?.querySelector('.accent-body')
  const mark = accentBody?.textContent?.trim() ?? ''
  const path = accentEntry?.querySelector('path')?.getAttribute('d') ?? ''
  let command = new Map([
    ['ˉ', 'bar'], ['¯', 'bar'], ['‾', 'bar'],
    ['^', 'hat'], ['ˆ', 'hat'], ['˜', 'tilde'], ['~', 'tilde'],
    ['→', 'vec'], ['˙', 'dot'], ['¨', 'ddot']
  ]).get(mark)
  if (!command && accentBody?.querySelector('svg')) command = 'vec'
  if (!command && path.startsWith('M1181 0h2')) command = 'widehat'
  if (!command && path.startsWith('M344 55.266')) command = 'widetilde'
  if (command) return `\\${command}${groupLatex(base)}`
  return mark ? `\\overset${groupLatex(tokenToLatex(mark, true))}${groupLatex(base)}` : base
}

function katexLineAccentToLatex(element: Element, command: 'overline' | 'underline'): string {
  const entries = getKatexVListEntries(element)
  const lineClass = command === 'overline' ? '.overline-line' : '.underline-line'
  const baseEntry = entries.find((entry) => !entry.querySelector(lineClass))
  const base = baseEntry ? katexHtmlNodeToLatex(baseEntry) : ''
  return base ? `\\${command}${groupLatex(base)}` : ''
}

function katexSqrtToLatex(element: Element): string {
  const root = element.querySelector(':scope > .root')
  const index = root ? katexHtmlNodeToLatex(root) : ''
  const radicand = element.querySelector(
    ':scope > .vlist-t > .vlist-r:first-child > .vlist > .svg-align > .mord, ' +
      ':scope > .vlist-t2 > .vlist-r:first-child > .vlist > .svg-align > .mord'
  )
  const body = radicand ? katexHtmlNodeToLatex(radicand) : ''
  if (!body) return '\\sqrt{}'
  return index
    ? `\\sqrt[${index.trim()}]${groupLatex(body)}`
    : `\\sqrt${groupLatex(body)}`
}

const KATEX_X_ARROW_SIGNATURES: Array<[string, string[]]> = [
  ['xleftrightarrow', ['M400000 241H110', 'M0 241v40h399891']],
  ['xLeftrightarrow', ['M262 157 l10-10', 'M399738 392l -10 10']],
  ['xhookleftarrow', ['M400000 241H110', 'M399859 241c-764']],
  ['xhookrightarrow', ['M400000 281 H103', 'M0 241v40h399891']],
  ['xmapsto', ['M40 281 V448H0V74', 'M0 241v40h399891']],
  ['xrightleftharpoons', ['M7 435c-4 4-6.3', 'M0 241v40h399993']],
  ['xleftrightharpoons', ['M0 267c.7 5.3 3 10', 'M399747 705c0 7.3']],
  ['xtofrom', ['M0 147h400000v40', 'M400000 167c-70.7']],
  ['xrightarrow', ['M0 241v40h399891']],
  ['xleftarrow', ['M400000 241H110']],
  ['xRightarrow', ['M399738 392l -10 10']],
  ['xLeftarrow', ['M262 157 l10-10']],
  ['xrightharpoondown', ['M399747 511c0 7.3']],
  ['xrightharpoonup', ['M0 241v40h399993']],
  ['xleftharpoondown', ['M7 241c-4 4-6.333']],
  ['xleftharpoonup', ['M0 267c.7 5.3 3 10']],
  ['xlongequal', ['M0 50 h400000 v40']],
  ['xtwoheadrightarrow', ['M400000 167 c-68-40']],
  ['xtwoheadleftarrow', ['M0 167c68 40']]
]

function normalizeKatexSvgPath(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function identifyKatexXArrowCommand(paths: string[]): string | null {
  const normalized = paths.map(normalizeKatexSvgPath)
  for (const [command, signatures] of KATEX_X_ARROW_SIGNATURES) {
    if (
      normalized.length === signatures.length &&
      signatures.every((signature, index) => normalized[index]?.startsWith(signature))
    ) {
      return command
    }
  }
  return null
}

function katexXArrowToLatex(element: Element): string {
  const entries = getKatexVListEntries(element)
    .map((entry) => ({
      element: entry,
      top: Number.parseFloat(entry.style.top)
    }))
    .filter((entry) => Number.isFinite(entry.top))
    .sort((a, b) => a.top - b.top)
  const arrow = entries.find((entry) => entry.element.matches('.svg-align'))
  if (!arrow) return ''
  const command = identifyKatexXArrowCommand(
    Array.from(arrow.element.querySelectorAll('path')).map((path) => path.getAttribute('d') ?? '')
  )
  if (!command) return ''

  const upper = entries.find((entry) => entry.top < arrow.top)
  const lower = [...entries].reverse().find((entry) => entry.top > arrow.top)
  const upperLatex = upper ? katexHtmlNodeToLatex(upper.element) : ''
  const lowerLatex = lower ? katexHtmlNodeToLatex(lower.element) : ''
  return '\\' + command + (lowerLatex ? '[' + lowerLatex + ']' : '') + groupLatex(upperLatex)
}

function katexTableToLatex(element: Element): string {
  const columns = Array.from(element.children).filter((child) =>
    Array.from(child.classList).some((className) => className.startsWith('col-align-'))
  )
  const cellsByColumn = columns.map((column) =>
    getKatexVListEntries(column)
      .map((entry) => ({ top: Number.parseFloat(entry.style.top), latex: katexHtmlNodeToLatex(entry) }))
      .filter((entry) => Number.isFinite(entry.top))
      .sort((a, b) => a.top - b.top)
      .map((entry) => entry.latex)
  )
  const rowCount = Math.max(0, ...cellsByColumn.map((column) => column.length))
  const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
    cellsByColumn.map((column) => column[rowIndex] ?? '').join(' & ')
  )
  if (columns.length === 1 && rows.length > 1) {
    return `\\substack{${rows.join(' \\\\ ')}}`
  }
  const wrapper = element.parentElement?.parentElement
  const open = wrapper?.querySelector(':scope > .mopen')?.textContent?.trim() ?? ''
  const close = wrapper?.querySelector(':scope > .mclose')?.textContent?.trim() ?? ''
  const alignments = columns.map((column) =>
    Array.from(column.classList).find((className) => className.startsWith('col-align-')) ?? ''
  )
  let environment = !open && !close && alignments.some((alignment) => alignment !== 'col-align-c')
    ? 'aligned'
    : 'matrix'
  if (open === '(' && close === ')') environment = 'pmatrix'
  else if (open === '[' && close === ']') environment = 'bmatrix'
  else if (open === '{' && close === '}') environment = 'Bmatrix'
  else if (open === '|' && close === '|') environment = 'vmatrix'
  else if (open === '∥' && close === '∥') environment = 'Vmatrix'
  else if (open === '{' && !close) environment = 'cases'
  return `\\begin{${environment}}${rows.join(' \\\\ ')}\\end{${environment}}`
}

const KATEX_NAMED_OPERATORS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf',
  'det', 'gcd', 'Pr', 'arg'
])

function katexLimitsToLatex(element: Element): string {
  const entries = getKatexVListEntries(element)
    .map((entry) => ({
      element: entry,
      top: Number.parseFloat(entry.style.top),
      latex: katexHtmlNodeToLatex(entry)
    }))
    .filter((entry) => Number.isFinite(entry.top) && entry.latex)
    .sort((a, b) => a.top - b.top)
  const base = entries.find((entry) => entry.element.querySelector('.mop'))
  if (!base) return entries.map((entry) => entry.latex).join('')
  const over = entries.filter((entry) => entry.top < base.top)
  const under = entries.filter((entry) => entry.top > base.top)
  const underLatex = under.map((entry) => entry.latex).join(' ')
  const overLatex = over.map((entry) => entry.latex).join(' ')
  if (overLatex && /^\s*[=<>]/.test(base.latex)) {
    return `\\overset${groupLatex(overLatex)}${groupLatex(base.latex)}`
  }
  if (underLatex && base.latex.includes('\\arg')) {
    return `\\underset${groupLatex(underLatex)}${groupLatex(base.latex)}`
  }
  let result = base.latex
  if (underLatex) result += `_${groupLatex(underLatex)}`
  if (overLatex) result += `^${groupLatex(overLatex)}`
  return result
}

function katexNegatedRelationToLatex(element: Element): string | null {
  if (element.querySelector('.rlap') && element.textContent?.includes('=')) return '\\ne'
  if (!element.querySelector('.llap')) return null
  const relation = element.querySelector('.mrel')?.textContent?.replace('/', '').trim() ?? ''
  const mapped = tokenToLatex(relation, true)
  if (mapped === '\\in') return '\\notin'
  return mapped ? `\\not${mapped}` : null
}

function katexBinomialToLatex(element: Element): string | null {
  const fraction = element.querySelector(':scope > .mfrac')
  if (!fraction || fraction.querySelector('.frac-line')) return null
  const open = element.querySelector(':scope > .mopen')?.textContent?.trim()
  const close = element.querySelector(':scope > .mclose')?.textContent?.trim()
  if (open !== '(' || close !== ')') return null
  const fractionLatex = katexFractionToLatex(fraction)
  return fractionLatex ? fractionLatex.replace(/^\\frac/, '\\binom') : null
}

function katexPmodToLatex(element: Element): string | null {
  if (!element.classList.contains('base')) return null
  const open = element.querySelector(':scope > .mopen')?.textContent?.trim()
  const close = element.querySelector(':scope > .mclose')?.textContent?.trim()
  const mod = element.querySelector('.mathrm')?.textContent?.trim()
  if (open !== '(' || close !== ')' || mod !== 'mod') return null
  const value = Array.from(element.querySelectorAll('.mathnormal'))
    .map((part) => katexHtmlNodeToLatex(part))
    .join('')
  return value ? `\\pmod${groupLatex(value)}` : null
}

function katexTextToLatex(element: Element): string {
  const raw = (element.textContent ?? '').replace(/\u00a0/g, ' ')
  const escaped = escapeLatexText(raw).replace(/^ +| +$/g, (spaces) => '~'.repeat(spaces.length))
  return `\\text{${escaped}}`
}

function katexBoxToLatex(element: Element): string | null {
  const box = element.querySelector<HTMLElement>(
    ':scope > .vlist-t .boxpad, :scope > .vlist-t2 .boxpad'
  )
  if (!box || !element.querySelector(':scope > .vlist-t .fbox, :scope > .vlist-t2 .fbox')) {
    return null
  }
  const content = katexHtmlNodeToLatex(box)
  return content ? `\\boxed${groupLatex(content)}` : null
}

function joinKatexLatexParts(parts: string[]): string {
  return parts.filter(Boolean).reduce((result, part) => {
    const needsSeparator = /\\[A-Za-z]+$/.test(result) && /^[A-Za-z]/.test(part)
    return result + (needsSeparator ? ' ' : '') + part
  }, '')
}

function katexBraceToLatex(element: Element): string | null {
  const command = element.classList.contains('munder')
    ? 'underbrace'
    : element.classList.contains('mover') ? 'overbrace' : null
  if (!command || !element.querySelector('.stretchy [class^="brace-"]')) return null
  const entries = getKatexVListEntries(element)
  const nestedEntry = entries.find((entry) =>
    Boolean(entry.querySelector(`.${command === 'underbrace' ? 'munder' : 'mover'}`))
  )
  if (nestedEntry) {
    const annotation = entries.find((entry) => entry !== nestedEntry)
    const base = katexHtmlNodeToLatex(nestedEntry)
    const script = annotation ? katexHtmlNodeToLatex(annotation) : ''
    if (!script) return base
    return command === 'underbrace'
      ? `${base}_${groupLatex(script)}`
      : `${base}^${groupLatex(script)}`
  }
  const baseEntry = entries.find((entry) => !entry.querySelector('.stretchy [class^="brace-"]'))
  const base = baseEntry ? katexHtmlNodeToLatex(baseEntry) : ''
  return base ? `\\${command}${groupLatex(base)}` : null
}

function katexSvgDelimiterToLatex(element: Element): string | null {
  if (!element.classList.contains('mopen') && !element.classList.contains('mclose')) return null
  const path = element.querySelector('path')?.getAttribute('d') ?? ''
  if (path.startsWith('M145 15 v585')) return '|'
  return null
}

function katexStyledAtomToLatex(element: Element, content: string): string | null {
  if (!content) return null
  if (element.classList.contains('mathcal')) return `\\mathcal${groupLatex(content)}`
  if (element.classList.contains('mathbb')) return `\\mathbb${groupLatex(content)}`
  if (element.classList.contains('mathbf')) return `\\mathbf${groupLatex(content)}`
  if (element.classList.contains('mathrm')) return `\\mathrm${groupLatex(content)}`
  if (element.classList.contains('mathtt')) return `\\mathtt${groupLatex(content)}`
  if (element.classList.contains('mathsf')) return `\\mathsf${groupLatex(content)}`
  if (element.classList.contains('mathfrak')) return `\\mathfrak${groupLatex(content)}`
  if (element.classList.contains('boldsymbol')) return `\\boldsymbol${groupLatex(content)}`
  return null
}

function katexHtmlNodeToLatex(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return tokenToLatex(node.textContent ?? '', true)
  if (!(node instanceof Element)) return ''
  if (node.tagName === 'SVG' || hasAnyClass(node, KATEX_IGNORED_CLASSES)) return ''
  if (node.classList.contains('x-arrow')) return katexXArrowToLatex(node)
  if (node.classList.contains('msupsub')) return katexScriptToLatex(node)
  if (node.classList.contains('mfrac')) return katexFractionToLatex(node)
  if (node.classList.contains('sqrt')) return katexSqrtToLatex(node)
  if (node.classList.contains('accent')) return katexAccentToLatex(node)
  if (node.classList.contains('overline')) return katexLineAccentToLatex(node, 'overline')
  if (node.classList.contains('underline')) return katexLineAccentToLatex(node, 'underline')
  if (node.classList.contains('mtable')) return katexTableToLatex(node)
  if (
    node.classList.contains('minner') &&
    node.querySelector(':scope > .mord > .mtable')
  ) {
    return katexTableToLatex(node.querySelector(':scope > .mord > .mtable')!)
  }
  const brace = katexBraceToLatex(node)
  if (brace) return brace
  if (node.classList.contains('op-limits')) return katexLimitsToLatex(node)
  const svgDelimiter = katexSvgDelimiterToLatex(node)
  if (svgDelimiter) return svgDelimiter
  const binomial = katexBinomialToLatex(node)
  if (binomial) return binomial
  const pmod = katexPmodToLatex(node)
  if (pmod) return pmod
  if (node.classList.contains('text')) return katexTextToLatex(node)
  if (
    node.classList.contains('mop') &&
    KATEX_NAMED_OPERATORS.has((node.textContent ?? '').trim())
  ) {
    return `\\${(node.textContent ?? '').trim()}`
  }
  if (
    node.classList.contains('mop') &&
    node.children.length === 1 &&
    node.firstElementChild?.classList.contains('mathrm')
  ) {
    return `\\operatorname${groupLatex(node.textContent ?? '')}`
  }
  if (node.classList.contains('mrel')) {
    const negated = katexNegatedRelationToLatex(node)
    if (negated) return ` ${negated} `
  }
  const boxed = katexBoxToLatex(node)
  if (boxed) return boxed

  const content = joinKatexLatexParts(Array.from(node.childNodes).map(katexHtmlNodeToLatex))
  const styled = katexStyledAtomToLatex(node, content)
  if (styled) return styled
  if (node.classList.contains('mrel')) {
    return ` ${node.children.length ? content : tokenToLatex(node.textContent ?? '', true)} `
  }
  if (node.classList.contains('mbin')) {
    return ` ${node.children.length ? content : tokenToLatex(node.textContent ?? '', true)} `
  }
  if (node.classList.contains('minner') && !node.children.length) {
    return tokenToLatex(node.textContent ?? '', true)
  }
  return content
}

/** 从 KaTeX output=html 的可视 DOM 反向恢复常见 LaTeX。 */
export function katexHtmlElementToLatex(container: Element): string | null {
  const html = container.matches('.katex-html')
    ? container
    : container.querySelector('.katex-html')
  if (!html) return null
  const latex = normalizeMathMlLatex(katexHtmlNodeToLatex(html))
    .replace(/([A-Za-z0-9}])\s+([([{])/g, '$1$2')
    .trim()
  return normalizeLatexCandidate(latex)
}

function findAttributeSource(container: Element): string | null {
  for (const candidate of sourceAttributeCandidates(container)) {
    for (const attribute of SOURCE_ATTRIBUTES) {
      const source = normalizeLatexCandidate(candidate.getAttribute(attribute))
      if (source) return source
    }
  }
  return null
}

function findAccessibleSource(container: Element): string | null {
  const candidates = [container, ...Array.from(container.querySelectorAll('[aria-label], [title]'))]
  for (const candidate of candidates) {
    const source = normalizeLatexCandidate(
      candidate.getAttribute('aria-label') ?? candidate.getAttribute('title')
    )
    if (!source || /^(math|formula|equation|公式|数学公式)$/i.test(source)) continue
    return source
  }
  return null
}

export function extractLatexSource(container: Element | null): string | null {
  if (!(container instanceof Element)) return null

  const annotation = container.matches(TEX_ANNOTATION_SELECTOR)
    ? container : container.querySelector(TEX_ANNOTATION_SELECTOR)
  const annotationSource = normalizeLatexCandidate(annotation?.textContent)
  if (annotationSource) return annotationSource

  const attributeSource = findAttributeSource(container)
  if (attributeSource) return attributeSource
  const texScript = container.querySelector('script[type^="math/tex"], script[type="application/x-tex"]')
  const scriptSource = normalizeLatexCandidate(texScript?.textContent)
  if (scriptSource) return scriptSource

  let current: Element | null = container
  while (current instanceof Element) {
    const rootNode: Node | null = current.getRootNode()
    if (!(rootNode instanceof ShadowRoot)) break
    const host: Element = rootNode.host
    const raw = normalizeLatexCandidate(host.getAttribute('raw'))
    if (host.tagName === 'CIB-MATH' && raw) return raw
    current = host
  }

  const mathElement = container.matches('math') ? container : container.querySelector('math')
  if (mathElement) {
    const mathMlSource = normalizeLatexCandidate(mathMlElementToLatex(mathElement))
    if (mathMlSource) return mathMlSource
  }

  const katexHtmlSource = katexHtmlElementToLatex(container)
  if (katexHtmlSource) return katexHtmlSource
  return findAccessibleSource(container)
}

export function findFormulaElement(path: EventTarget[]): Element | null {
  for (const item of path) {
    if (!(item instanceof Element) || !item.matches(FORMULA_SELECTOR)) continue
    const katex = item.closest('.katex')
    if (katex) return katex.closest('.katex-display') ?? katex
    return item.closest('mjx-container, cib-math') ?? item
  }
  return null
}

export function isFormulaElement(element: Element | null): boolean {
  if (!(element instanceof Element)) return false
  return Boolean(
    element.matches(FORMULA_SELECTOR) ||
      (element.tagName === 'SPAN' && Boolean(element.querySelector(TEX_ANNOTATION_SELECTOR)))
  )
}

export function isDisplayFormula(element: Element | null): boolean {
  if (!(element instanceof Element)) return false
  if (element.matches('.katex-display, math[display="block"], mjx-container[display="true"]')) return true
  const display = window.getComputedStyle(element).display
  return display === 'block' || display === 'flex'
}
