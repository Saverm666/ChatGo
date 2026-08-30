export interface BranchAnchorRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface BranchButtonPositionOptions {
  anchor: BranchAnchorRect
  buttonWidth: number
  buttonHeight: number
  viewportWidth: number
  viewportHeight: number
  backward: boolean
  gap?: number
  margin?: number
}

export interface BranchButtonPosition {
  left: number
  top: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

export function calculateBranchButtonPosition({
  anchor,
  buttonWidth,
  buttonHeight,
  viewportWidth,
  viewportHeight,
  backward,
  gap = 10,
  margin = 12
}: BranchButtonPositionOptions): BranchButtonPosition {
  const preferredLeft = backward
    ? anchor.left - buttonWidth - gap
    : anchor.right + gap
  const alternateLeft = backward
    ? anchor.right + gap
    : anchor.left - buttonWidth - gap
  const preferredTop = backward
    ? anchor.top - buttonHeight - gap
    : anchor.bottom + gap
  const alternateTop = backward
    ? anchor.bottom + gap
    : anchor.top - buttonHeight - gap

  const fitsHorizontally = (left: number): boolean =>
    left >= margin && left + buttonWidth <= viewportWidth - margin
  const fitsVertically = (top: number): boolean =>
    top >= margin && top + buttonHeight <= viewportHeight - margin

  const maxLeft = Math.max(margin, viewportWidth - buttonWidth - margin)
  const maxTop = Math.max(margin, viewportHeight - buttonHeight - margin)
  return {
    left: clamp(
      fitsHorizontally(preferredLeft) ? preferredLeft : alternateLeft,
      margin,
      maxLeft
    ),
    top: clamp(
      fitsVertically(preferredTop) ? preferredTop : alternateTop,
      margin,
      maxTop
    )
  }
}
