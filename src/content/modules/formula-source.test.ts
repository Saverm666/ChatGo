import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FORMULA_SOURCE_ATTRIBUTES,
  identifyKatexXArrowCommand,
  mathMlElementToLatex,
  sourceAttributeCandidates
} from './formula-source.ts'

class FakeMathElement {
  tagName: string
  children: Element[]
  textContent: string
  private attributes: Record<string, string>

  constructor(
    tagName: string,
    textContent = '',
    children: Element[] = [],
    attributes: Record<string, string> = {}
  ) {
    this.tagName = tagName.toUpperCase()
    this.children = children
    this.textContent = textContent || children.map((child) => child.textContent).join('')
    this.attributes = attributes
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }
}

const el = (
  tagName: string,
  textContent = '',
  children: Element[] = [],
  attributes: Record<string, string> = {}
): Element => new FakeMathElement(tagName, textContent, children, attributes) as unknown as Element

test('restores diffusion subscripts and arrows from MathML without TeX annotation', () => {
  const math = el('math', '', [
    el('mrow', '', [
      el('msub', '', [el('mi', 'x'), el('mn', '0')]),
      el('mo', '→'),
      el('msub', '', [el('mi', 'x'), el('mn', '1')]),
      el('mo', '→'),
      el('mo', '⋯'),
      el('mo', '→'),
      el('msub', '', [el('mi', 'x'), el('mi', 'T')])
    ])
  ])
  assert.equal(mathMlElementToLatex(math), 'x_{0} \\to x_{1} \\to \\cdots \\to x_{T}')
})

test('restores fractions, roots and fenced expressions from MathML', () => {
  const math = el('math', '', [
    el('mrow', '', [
      el('mi', 'y'),
      el('mo', '='),
      el('mfrac', '', [el('mn', '1'), el('msqrt', '', [el('mi', 'x')])]),
      el('mfenced', '', [el('mn', '0'), el('mi', 'I')], { open: '(', close: ')', separators: ',' })
    ])
  ])
  assert.equal(mathMlElementToLatex(math), 'y = \\frac{1}{\\sqrt{x}} (0, I)')
})


test('preserves TeX variant Greek symbols from MathML glyphs', () => {
  const row = el('mrow', '', [
    el('mi', 'ε'), el('mo', '+'), el('mi', 'φ'),
    el('mo', '+'), el('mi', 'ϵ'), el('mo', '+'), el('mi', 'ϕ')
  ])
  assert.equal(
    mathMlElementToLatex(row),
    '\\varepsilon + \\varphi + \\epsilon + \\phi'
  )
})

test('restores indexed roots with nested fractions', () => {
  const root = el('mroot', '', [
    el('mrow', '', [
      el('mn', '1'),
      el('mo', '+'),
      el('mfrac', '', [el('mn', '1'), el('mi', 'x')])
    ]),
    el('mn', '3')
  ])
  assert.equal(mathMlElementToLatex(root), '\\sqrt[3]{1 + \\frac{1}{x}}')
})

test('restores combined lower and upper limits', () => {
  const sum = el('munderover', '', [
    el('mo', '∑'),
    el('mrow', '', [el('mi', 'i'), el('mo', '='), el('mn', '1')]),
    el('mi', 'n')
  ])
  assert.equal(mathMlElementToLatex(sum), '\\sum_{i = 1}^{n}')
})

test('restores matrices row by row', () => {
  const table = el('mtable', '', [
    el('mtr', '', [el('mtd', '', [el('mi', 'a')]), el('mtd', '', [el('mi', 'b')])]),
    el('mtr', '', [el('mtd', '', [el('mi', 'c')]), el('mtd', '', [el('mi', 'd')])])
  ])
  assert.equal(
    mathMlElementToLatex(table),
    '\\begin{matrix}a & b \\\\ c & d\\end{matrix}'
  )
})

test('restores unusual operators and scalable delimiter glyphs', () => {
  const row = el('mrow', '', [
    el('mo', '∬'), el('mi', 'D'), el('mo', '∣'),
    el('mo', '⌊'), el('mi', 'x'), el('mo', '⌋')
  ])
  assert.equal(mathMlElementToLatex(row), '\\iint D \\mid \\lfloor x \\rfloor')
})


test('identifies KaTeX extensible arrows from their current SVG paths', () => {
  assert.equal(
    identifyKatexXArrowCommand(['M0 241v40h399891c-764 0-1527']),
    'xrightarrow'
  )
  assert.equal(
    identifyKatexXArrowCommand([
      'M400000   241H110c764 0',
      'M0 241v40h399891c-764 0'
    ]),
    'xleftrightarrow'
  )
  assert.equal(
    identifyKatexXArrowCommand([
      'M262 157 l10-10c34-36',
      'M399738 392l -10 10c-34 36'
    ]),
    'xLeftrightarrow'
  )
})

test('does not guess an extensible-arrow command for an unknown SVG', () => {
  assert.equal(identifyKatexXArrowCommand(['M1 2L3 4']), null)
})

// 2026-09 登录态 ChatGPT 把原始 LaTeX 放在包裹 KaTeX 的祖先元素上：
// <span class="block" data-math-source="\mathcal{L} = …"><span class="katex-display">…
test('属性取源包含 ChatGPT 登录态的 data-math-source', () => {
  assert.ok(FORMULA_SOURCE_ATTRIBUTES.includes('data-math-source'))
})

test('属性取源顺序为 自身 → 祖先(至多 3 层) → 容器内公式节点', () => {
  const greatGrandparent = el('span')
  const grandparent = el('span')
  const parent = el('span', '', [], { 'data-math-source': '\\mathcal{L} = 1' })
  const self = el('span')
  const fake = self as unknown as { parentElement: Element | null; querySelectorAll: () => Element[] }
  fake.parentElement = parent as unknown as Element
  ;(parent as unknown as { parentElement: Element | null }).parentElement =
    grandparent as unknown as Element
  ;(grandparent as unknown as { parentElement: Element | null }).parentElement =
    greatGrandparent as unknown as Element
  fake.querySelectorAll = () => []

  assert.deepEqual(sourceAttributeCandidates(self), [self, parent, grandparent, greatGrandparent])
})

test('祖先超过 3 层后不再继续向上取源', () => {
  const ancestors = [el('span'), el('span'), el('span'), el('span'), el('span')]
  const self = el('span')
  const fake = self as unknown as { parentElement: Element | null; querySelectorAll: () => Element[] }
  fake.querySelectorAll = () => []
  let current: { parentElement: Element | null } = fake
  for (const ancestor of ancestors) {
    current.parentElement = ancestor as unknown as Element
    current = ancestor as unknown as { parentElement: Element | null }
  }
  assert.deepEqual(sourceAttributeCandidates(self), [
    self,
    ancestors[0],
    ancestors[1],
    ancestors[2]
  ])
})
