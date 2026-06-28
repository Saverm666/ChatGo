export interface ViewportSize {
  width: number
  height: number
}

export interface FloatingPoint {
  x: number
  y: number
}

export interface FloatingRatio {
  xRatio: number
  yRatio: number
}

export interface PanelSize {
  width: number
  height: number
}

export interface PanelPlacement {
  horizontal: 'left' | 'right'
  vertical: 'above' | 'below'
  side: 'left' | 'right' | 'above' | 'below'
}

export interface PanelPosition {
  left?: number
  right?: number
  top?: number
  bottom?: number
  maxHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function maxFloatingX(viewport: ViewportSize, fabSize: number, margin: number): number {
  return Math.max(margin, viewport.width - fabSize - margin)
}

function maxFloatingY(viewport: ViewportSize, fabSize: number, margin: number): number {
  return Math.max(margin, viewport.height - fabSize - margin)
}

export function getDefaultFloatingRatio(): FloatingRatio {
  return { xRatio: 1, yRatio: 1 }
}

export function getResponsivePanelSize(
  viewport: ViewportSize,
  width: number,
  heightRatio: number,
  minHeight: number,
  maxHeight: number,
  margin: number
): PanelSize {
  const availableHeight = Math.max(1, viewport.height - margin * 2)
  const targetHeight = clamp(Math.round(viewport.height * heightRatio), minHeight, maxHeight)
  return {
    width,
    height: Math.min(targetHeight, availableHeight)
  }
}

export function clampFloatingPosition(
  point: FloatingPoint,
  viewport: ViewportSize,
  fabSize: number,
  margin: number
): FloatingPoint {
  return {
    x: clamp(point.x, margin, maxFloatingX(viewport, fabSize, margin)),
    y: clamp(point.y, margin, maxFloatingY(viewport, fabSize, margin))
  }
}

export function positionToRatio(
  point: FloatingPoint,
  viewport: ViewportSize,
  fabSize: number,
  margin: number
): FloatingRatio {
  const clamped = clampFloatingPosition(point, viewport, fabSize, margin)
  const rangeX = Math.max(1, maxFloatingX(viewport, fabSize, margin) - margin)
  const rangeY = Math.max(1, maxFloatingY(viewport, fabSize, margin) - margin)
  return {
    xRatio: clamp((clamped.x - margin) / rangeX, 0, 1),
    yRatio: clamp((clamped.y - margin) / rangeY, 0, 1)
  }
}

export function ratioToPosition(
  ratio: FloatingRatio,
  viewport: ViewportSize,
  fabSize: number,
  margin: number
): FloatingPoint {
  const rangeX = Math.max(1, maxFloatingX(viewport, fabSize, margin) - margin)
  const rangeY = Math.max(1, maxFloatingY(viewport, fabSize, margin) - margin)
  return clampFloatingPosition(
    {
      x: margin + rangeX * clamp(ratio.xRatio, 0, 1),
      y: margin + rangeY * clamp(ratio.yRatio, 0, 1)
    },
    viewport,
    fabSize,
    margin
  )
}

export function getPanelPlacement(
  point: FloatingPoint,
  viewport: ViewportSize,
  panel: PanelSize,
  fabSize: number,
  gap: number
): PanelPlacement {
  const spaceLeft = point.x
  const spaceRight = viewport.width - point.x - fabSize
  const spaceAbove = point.y
  const spaceBelow = viewport.height - point.y - fabSize
  const horizontalSide = spaceLeft <= spaceRight ? 'right' : 'left'
  const verticalSide = spaceAbove <= spaceBelow ? 'below' : 'above'
  const side = Math.min(spaceLeft, spaceRight) <= Math.min(spaceAbove, spaceBelow)
    ? horizontalSide
    : verticalSide

  return {
    horizontal: side === 'left' || side === 'right'
      ? side
      : spaceRight >= panel.width + gap || spaceRight >= spaceLeft ? 'right' : 'left',
    vertical: side === 'above' || side === 'below'
      ? side
      : spaceBelow >= panel.height + gap || spaceBelow >= spaceAbove ? 'below' : 'above',
    side
  }
}

export function getPanelPosition(
  point: FloatingPoint,
  viewport: ViewportSize,
  panel: PanelSize,
  fabSize: number,
  margin: number,
  gap: number,
  placement: PanelPlacement
): PanelPosition {
  const fullMaxHeight = Math.min(panel.height, Math.max(1, viewport.height - margin * 2))

  if (placement.side === 'left' || placement.side === 'right') {
    const position: PanelPosition = { maxHeight: fullMaxHeight }
    if (placement.side === 'left') {
      position.right = viewport.width - point.x + gap
    } else {
      position.left = point.x + fabSize + gap
    }

    if (point.y + fabSize / 2 > viewport.height / 2) {
      position.bottom = Math.max(margin, viewport.height - point.y - fabSize)
    } else {
      position.top = Math.max(margin, point.y)
    }

    return position
  }

  const maxHeight = placement.side === 'above'
    ? Math.min(panel.height, Math.max(1, point.y - gap - margin))
    : Math.min(panel.height, Math.max(1, viewport.height - point.y - fabSize - gap - margin))
  if (placement.side === 'above') {
    return {
      ...(point.x + fabSize / 2 > viewport.width / 2
        ? { right: Math.max(margin, viewport.width - point.x - fabSize) }
        : { left: Math.max(margin, point.x) }),
      bottom: viewport.height - point.y + gap,
      maxHeight
    }
  }

  return {
    ...(point.x + fabSize / 2 > viewport.width / 2
      ? { right: Math.max(margin, viewport.width - point.x - fabSize) }
      : { left: Math.max(margin, point.x) }),
    top: clamp(point.y + fabSize + gap, margin, viewport.height - maxHeight - margin),
    maxHeight
  }
}
