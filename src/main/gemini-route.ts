// Ignore locale/query/hash changes: only a different saved Gemini chat is a
// destination for a native branch draft, within the same signed-in account.
export function isGeminiBranchDestination(source: string, destination: string): boolean {
  try {
    const from = new URL(source)
    const to = new URL(destination)
    if (from.origin !== 'https://gemini.google.com' || to.origin !== from.origin) return false
    const route = /^(\/u\/\d+)?\/app\/([^/]+)\/?$/
    const a = from.pathname.match(route)
    const b = to.pathname.match(route)
    return Boolean(a && b && (a[1] ?? '') === (b[1] ?? '') && a[2] !== b[2])
  } catch { return false }
}
