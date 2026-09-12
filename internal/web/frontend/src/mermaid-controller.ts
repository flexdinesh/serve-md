import { calculateDiagramHeight, diagramFitPadding, type DiagramBounds } from "./diagram.ts"

interface MermaidBounds extends DiagramBounds {
  x: number
  y: number
}

interface MermaidDiagramOptions {
  mermaidConfig: {
    securityLevel: "strict"
    suppressErrorRendering: true
    theme: "dark" | "default"
    themeVariables: { darkMode: boolean }
  }
  onUnsupportedDiagram(svg: string): Promise<void>
}

export interface MermaidControllerEditor {
  clearHistory(): void
  deleteCurrentPageShapes(): void
  getCurrentPageBounds(): MermaidBounds | null
  hasCurrentPageShapes(): boolean
  putExternalContent(content: { text: string; type: "svg-text" }): Promise<void>
  setCurrentTool(tool: "hand"): void
  setReadonly(readonly: boolean): void
  zoomIn(): void
  zoomOut(): void
  zoomToBounds(bounds: MermaidBounds, options: { inset: number }): void
}

interface ResizeObserverLike {
  disconnect(): void
  observe(): void
}

export type MermaidTheme = "light" | "dark"

interface MermaidControllerOptions {
  createDiagram(source: string, options: MermaidDiagramOptions): Promise<void>
  createResizeObserver(callback: () => void): ResizeObserverLike
  editor: MermaidControllerEditor
  host: { getBoundingClientRect(): { width: number } }
  onError(error: unknown): void
  onHeight(height: number): void
  onReady(): void
  schedule(callback: () => void): void
  source: string
  theme: MermaidTheme
}

export function createMermaidController({
  createDiagram,
  createResizeObserver,
  editor,
  host,
  onError,
  onHeight,
  onReady,
  schedule,
  source,
  theme: initialTheme,
}: MermaidControllerOptions) {
  let disposed = false
  let fallback = false
  let pending: Promise<void> | undefined
  let rendered = 0
  let requested = 0
  let resizeObserver: ResizeObserverLike | undefined
  let previousWidth = 0
  let bounds: MermaidBounds | null = null
  let theme = initialTheme

  function fit(): void {
    if (bounds && !disposed) editor.zoomToBounds(bounds, { inset: diagramFitPadding })
  }

  function resize(): void {
    if (!bounds || disposed) return
    const width = host.getBoundingClientRect().width
    if (!(width > 0) || width === previousWidth) return
    previousWidth = width
    onHeight(calculateDiagramHeight(width, bounds))
    schedule(fit)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    resizeObserver?.disconnect()
  }

  function fail(error: unknown): void {
    if (disposed) return
    dispose()
    onError(error)
  }

  async function renderLatest(): Promise<void> {
    while (!disposed && rendered !== requested) {
      const version = requested
      if (editor.hasCurrentPageShapes()) {
        editor.setReadonly(false)
        editor.deleteCurrentPageShapes()
      }

      let renderedFallback = false
      const renderedTheme = theme
      await createDiagram(source, {
        mermaidConfig: {
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: renderedTheme === "dark" ? "dark" : "default",
          themeVariables: { darkMode: renderedTheme === "dark" },
        },
        async onUnsupportedDiagram(svg) {
          renderedFallback = true
          await editor.putExternalContent({ type: "svg-text", text: svg })
        },
      })
      if (disposed) return

      bounds = editor.getCurrentPageBounds()
      if (!bounds) throw new Error("Mermaid diagram created no shapes")
      editor.setCurrentTool("hand")
      editor.setReadonly(true)
      editor.clearHistory()
      fallback = renderedFallback
      rendered = version
      if (fallback && renderedTheme !== theme) requested += 1
      resize()
    }
  }

  function requestRender(): Promise<void> {
    requested += 1
    if (!pending) pending = renderLatest().finally(() => { pending = undefined })
    return pending
  }

  function setTheme(nextTheme: MermaidTheme): void {
    if (theme === nextTheme || disposed) return
    theme = nextTheme
    if (!pending && fallback) void requestRender().catch(fail)
  }

  async function start(): Promise<void> {
    try {
      await requestRender()
      if (disposed) return
      resizeObserver = createResizeObserver(resize)
      resizeObserver.observe()
      onReady()
    } catch (error) {
      fail(error)
    }
  }

  return {
    dispose,
    fit,
    setTheme,
    start,
    zoomIn: () => editor.zoomIn(),
    zoomOut: () => editor.zoomOut(),
  }
}
