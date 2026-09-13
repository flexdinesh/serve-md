export interface Features {
  mermaidTldraw: boolean
}

export type MermaidRenderer = "excalidraw" | "tldraw"

export const defaultFeatures: Features = {
  mermaidTldraw: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function parseFeatureValue(value: unknown): Features | null {
  if (!isRecord(value)) return null
  if (value.mermaidTldraw !== undefined && typeof value.mermaidTldraw !== "boolean") return null

  return {
    mermaidTldraw: value.mermaidTldraw === true,
  }
}

export function parseFeatures(source: string | null | undefined): Features | null {
  if (!source?.trim().startsWith("{")) return null

  try {
    const value: unknown = JSON.parse(source)
    return parseFeatureValue(value)
  } catch {
    return null
  }
}

export function readFeatures(root: ParentNode = document): Features | null {
  const source = root.querySelector<HTMLTemplateElement>("#feature-data")?.content.textContent
  return parseFeatures(source)
}

export function mermaidRenderer(features: Features): MermaidRenderer {
  return features.mermaidTldraw ? "tldraw" : "excalidraw"
}
