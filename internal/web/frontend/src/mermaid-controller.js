import { calculateDiagramHeight, diagramFitPadding } from "./diagram.js"

export function createMermaidController({
  createDiagram,
  createResizeObserver,
  editor,
  host,
  media,
  onError,
  onHeight,
  onReady,
  schedule,
  source,
}) {
  let disposed = false
  let fallback = false
  let pending
  let rendered = 0
  let requested = 0
  let resizeObserver
  let previousWidth = 0
  let bounds

  function fit() {
    if (bounds && !disposed) editor.zoomToBounds(bounds, { inset: diagramFitPadding })
  }

  function resize() {
    if (!bounds || disposed) return
    const width = host.getBoundingClientRect().width
    if (!(width > 0) || width === previousWidth) return
    previousWidth = width
    onHeight(calculateDiagramHeight(width, bounds))
    schedule(fit)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    resizeObserver?.disconnect()
    media.removeEventListener("change", handleThemeChange)
  }

  function fail(error) {
    if (disposed) return
    dispose()
    onError(error)
  }

  async function renderLatest() {
    while (!disposed && rendered !== requested) {
      const version = requested
      const shapeIDs = [...editor.getCurrentPageShapeIds()]
      if (shapeIDs.length > 0) {
        editor.updateInstanceState({ isReadonly: false })
        editor.deleteShapes(shapeIDs)
      }

      let renderedFallback = false
      await createDiagram(editor, source, {
        mermaidConfig: {
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: media.matches ? "dark" : "default",
          themeVariables: { darkMode: media.matches },
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
      editor.updateInstanceState({ isReadonly: true })
      editor.clearHistory()
      fallback = renderedFallback
      rendered = version
      resize()
    }
  }

  function requestRender() {
    requested += 1
    if (!pending) pending = renderLatest().finally(() => { pending = undefined })
    return pending
  }

  function handleThemeChange() {
    if (pending || fallback) void requestRender().catch(fail)
  }

  async function start() {
    media.addEventListener("change", handleThemeChange)
    try {
      await requestRender()
      if (disposed) return
      resizeObserver = createResizeObserver(resize)
      resizeObserver.observe(host)
      onReady()
    } catch (error) {
      fail(error)
    }
  }

  return {
    dispose,
    fit,
    start,
    zoomIn: () => editor.zoomIn(),
    zoomOut: () => editor.zoomOut(),
  }
}
