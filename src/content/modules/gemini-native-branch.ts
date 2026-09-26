const GEMINI_MORE_OPTIONS_PATTERNS = [
  /^show more options$/i,
  /^more options$/i,
  /^显示更多选项$/,
  /^更多选项$/,
  /^更多操作$/,
  /^顯示更多選項$/,
  /^更多選項$/
]

const GEMINI_BRANCH_ACTION_PATTERNS = [
  /^branch (?:in|to) (?:a )?new chat$/i,
  /^branch (?:from here|chat)$/i,
  /^在新(?:对话|聊天)中(?:创建)?分支$/,
  /^从此处(?:创建)?分支$/,
  /^在新(?:對話|聊天)中(?:建立|創建)?分支$/,
  /^從這裡(?:建立|創建)?分支$/
]

function normalizeActionLabel(label: string): string {
  return String(label ?? '').replace(/\s+/g, ' ').trim()
}

export function isGeminiMoreOptionsLabel(label: string): boolean {
  const normalized = normalizeActionLabel(label)
  return GEMINI_MORE_OPTIONS_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function isGeminiBranchActionLabel(label: string): boolean {
  const normalized = normalizeActionLabel(label)
  return (
    GEMINI_BRANCH_ACTION_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    (/分支/.test(normalized) && /新/.test(normalized) && /(?:对话|聊天|對話)/.test(normalized))
  )
}

function getActionLabels(element: Element): string[] {
  return [
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? ''
  ]
}

function isVisibleHtmlElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0
}

export function findGeminiResponseElement(turn: HTMLElement | null): HTMLElement | null {
  if (!turn) return null
  const response = turn.matches('model-response, [class*="model-response"]')
    ? turn
    : turn.closest('model-response, [class*="model-response"]')
  return response instanceof HTMLElement ? response : null
}

export function findGeminiMoreOptionsButton(response: HTMLElement): HTMLElement | null {
  const actions = Array.from(
    response.querySelectorAll<HTMLElement>('button, [role="button"]')
  ).filter(isVisibleHtmlElement)

  return actions.find((action) =>
    getActionLabels(action).some(isGeminiMoreOptionsLabel)
  ) ?? actions.find((action) =>
    Boolean(action.querySelector('[data-mat-icon-name="more_horiz"], [fonticon="more_horiz"]'))
  ) ?? null
}

export function findGeminiBranchMenuItem(searchRoot: ParentNode = document): HTMLElement | null {
  return Array.from(
    searchRoot.querySelectorAll<HTMLElement>('[role="menuitem"], button, [role="button"]')
  )
    .filter(isVisibleHtmlElement)
    .find((action) => getActionLabels(action).some(isGeminiBranchActionLabel)) ?? null
}
