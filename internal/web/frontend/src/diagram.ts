export const diagramFitPadding = 24
export const minimumDiagramHeight = 240
export const textBoundsPadding = 8

export interface DiagramBounds {
  h: number
  w: number
}

export function addTextRasterGutters(text: string): string {
  return `\u00a0${text}\u00a0`
}

export function padTextBounds({ x, width }: { x: number; width: number }): { x: number; width: number } {
  return {
    x: x - textBoundsPadding / 2,
    width: width + textBoundsPadding,
  }
}

export function calculateDiagramHeight(width: number, bounds?: DiagramBounds): number {
  if (!(width > 0) || !bounds || !(bounds.w > 0) || !(bounds.h > 0)) return minimumDiagramHeight
  const availableWidth = Math.max(1, width - diagramFitPadding)
  const height = Math.round((availableWidth * bounds.h) / bounds.w + diagramFitPadding)
  return Math.min(600, Math.max(minimumDiagramHeight, height))
}
