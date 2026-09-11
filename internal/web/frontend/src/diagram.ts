export const diagramFitPadding = 24
export const minimumDiagramHeight = 240

export interface DiagramBounds {
  h: number
  w: number
}

export function calculateDiagramHeight(width: number, bounds?: DiagramBounds): number {
  if (!(width > 0) || !bounds || !(bounds.w > 0) || !(bounds.h > 0)) return minimumDiagramHeight
  const availableWidth = Math.max(1, width - diagramFitPadding)
  const height = Math.round((availableWidth * bounds.h) / bounds.w + diagramFitPadding)
  return Math.min(600, Math.max(minimumDiagramHeight, height))
}
