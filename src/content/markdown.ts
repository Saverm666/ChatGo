// 提示词 Markdown + KaTeX 渲染工具
// 渲染管线：把 $...$ / $$...$$ 块替换成占位符 → markdown-it 解析 → 回填占位符 → DOMPurify 清洗

import MarkdownIt from 'markdown-it'
import katex from 'katex'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false
})

export interface RenderResult {
  html: string
  error?: string
  unclosedFormula: boolean
}

const KATEX_PLACEHOLDER = /@@CHATGO_KATEX_(\d+)@@/g

function replaceKatex(source: string, placeholders: string[]): { replaced: string; unclosed: boolean } {
  let unclosed = false
  const replaced = source.replace(/\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g, (match, block: string | undefined, inline: string | undefined) => {
    const isDisplay = typeof block === 'string'
    const tex = isDisplay ? block : inline ?? ''
    try {
      const html = katex.renderToString(tex, {
        displayMode: isDisplay,
        throwOnError: false,
        output: 'html'
      })
      const idx = placeholders.push(html)
      return `@@CHATGO_KATEX_${idx - 1}@@`
    } catch (err) {
      unclosed = true
      return match
    }
  })

  // 检测未闭合的 $：剩余文本中仍含 $（且数量为奇数）
  const remaining = replaced.replace(KATEX_PLACEHOLDER, '')
  const dollarCount = (remaining.match(/(?<![\\$])\$/g) ?? []).length
  if (dollarCount % 2 === 1) unclosed = true

  return { replaced, unclosed }
}

function restoreKatex(html: string, placeholders: string[]): string {
  return html.replace(KATEX_PLACEHOLDER, (_, idx) => placeholders[Number(idx)] ?? '')
}

export function renderPromptMarkdown(source: string): RenderResult {
  if (!source) return { html: '', unclosedFormula: false }

  const placeholders: string[] = []
  const { replaced, unclosed } = replaceKatex(source, placeholders)

  let rendered = md.render(replaced)
  rendered = restoreKatex(rendered, placeholders)

  // DOMPurify 在无 window 时（理论上不会发生）降级返回原字符串
  let safe = rendered
  if (typeof window !== 'undefined') {
    try {
      safe = DOMPurify.sanitize(rendered, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form']
      })
    } catch (err) {
      return { html: escapeHtml(rendered), unclosedFormula: unclosed, error: err instanceof Error ? err.message : '清洗失败' }
    }
  }

  return { html: safe, unclosedFormula: unclosed }
}

export function extractInlineKatexSources(source: string): string[] {
  const sources: string[] = []
  const re = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    sources.push((match[1] ?? match[2] ?? '').trim())
  }
  return sources
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
