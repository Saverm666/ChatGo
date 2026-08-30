export function buildChatGptBranchUrl(currentUrl: string, messageId: string): string | null {
  const sourceUrl = new URL(currentUrl)
  const conversationMatch = sourceUrl.pathname.match(/(?:^|\/)c\/([^/]+)/)
  const conversationId = conversationMatch?.[1]
  const normalizedMessageId = messageId.trim()
  if (!conversationId || !normalizedMessageId) return null

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
  return branchUrl.href
}
