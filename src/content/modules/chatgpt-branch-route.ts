// ChatGPT 分支作用域：普通聊天分支 / 工作分支。
// 分支入口统一走直接解析地址的 /branch/{conversationId}/{messageId} 路由，
// 不再操作消息菜单，所以这里只需要“从当前地址推断作用域”这一件事。
export type ChatGptBranchScope = 'chat' | 'work'

// 作用域跟随当前上下文：已经在 Work 模式里就从 Work 分支。
export function getChatGptBranchScopeFromUrl(url: string): ChatGptBranchScope {
  try {
    const parsed = new URL(url)
    const surface = (parsed.searchParams.get('surface') ?? '').toLowerCase()
    if (surface === 'work') return 'work'
    if (/(^|\/)work(\/|$)/i.test(parsed.pathname)) return 'work'
    return 'chat'
  } catch {
    return 'chat'
  }
}

function getConversationId(sourceUrl: URL): string | null {
  const encodedId = sourceUrl.pathname.match(/(?:^|\/)c\/([^/]+)/)?.[1]
  if (!encodedId) return null
  try {
    return decodeURIComponent(encodedId)
  } catch {
    return null
  }
}

export function isLocalChatGptConversationUrl(currentUrl: string): boolean {
  const conversationId = getConversationId(new URL(currentUrl))
  if (!conversationId) return false
  // 新建分支尚未写入服务器时，ChatGPT 使用 local-chatgpt:... 作为临时会话 ID。
  // 兼容已被错误地编码两次的地址，以免再次生成不可用的分支链接。
  let decodedId = conversationId
  if (decodedId.includes('%')) {
    try {
      decodedId = decodeURIComponent(decodedId)
    } catch {
      return false
    }
  }
  return decodedId.startsWith('local-chatgpt:')
}

export function buildChatGptBranchUrl(
  currentUrl: string,
  messageId: string,
  scope: ChatGptBranchScope = 'chat'
): string | null {
  const sourceUrl = new URL(currentUrl)
  const conversationId = getConversationId(sourceUrl)
  const normalizedMessageId = messageId.trim()
  if (!conversationId || !normalizedMessageId || isLocalChatGptConversationUrl(currentUrl)) return null

  const branchUrl = new URL(
    `/branch/${encodeURIComponent(conversationId)}/${encodeURIComponent(normalizedMessageId)}`,
    sourceUrl.origin
  )
  if (
    sourceUrl.searchParams.get('temporary-chat') === 'true' ||
    sourceUrl.searchParams.get('training_disabled') === 'true'
  ) {
    branchUrl.searchParams.set('temporary-chat', 'true')
  }
  if (scope === 'work') branchUrl.searchParams.set('surface', 'work')
  return branchUrl.href
}
