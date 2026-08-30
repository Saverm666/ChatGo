// DOM/Range 安全封装：浏览器选区 API 在跨 shadow/root 边界时偶尔会抛错。

export function getElementFromNode(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null
}

export function rangeIntersectsNode(node: Node, range: Range): boolean {
  try {
    return range.intersectsNode(node)
  } catch {
    return false
  }
}

export function compareBoundary(range: Range, how: number, sourceRange: Range): number {
  try {
    return range.compareBoundaryPoints(how, sourceRange)
  } catch {
    return 0
  }
}
