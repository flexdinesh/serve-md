import { createMermaidDiagram } from "@tldraw/mermaid"
import { useCallback, useEffect, useRef, useState } from "react"
import { Tldraw, type Editor } from "tldraw"
import "tldraw/tldraw.css"

import { Button } from "@/components/ui/button"

import { minimumDiagramHeight } from "./diagram.ts"
import { createMermaidController, type MermaidControllerEditor } from "./mermaid-controller.ts"
import { MermaidSource } from "./MermaidSource.tsx"

const renderError = "Could not render Mermaid diagram. Check its source."

function createDiagramResizeObserver(resize: () => void, host: HTMLDivElement) {
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(resize)
    return {
      disconnect: () => observer.disconnect(),
      observe: () => observer.observe(host),
    }
  }
  window.addEventListener("resize", resize)
  return {
    disconnect: () => window.removeEventListener("resize", resize),
    observe: resize,
  }
}

function controllerEditor(editor: Editor): MermaidControllerEditor {
  return {
    clearHistory: () => editor.clearHistory(),
    deleteCurrentPageShapes: () => editor.deleteShapes([...editor.getCurrentPageShapeIds()]),
    getCurrentPageBounds: () => editor.getCurrentPageBounds() ?? null,
    hasCurrentPageShapes: () => editor.getCurrentPageShapeIds().size > 0,
    putExternalContent: async (content) => editor.putExternalContent(content),
    setCurrentTool: (tool) => editor.setCurrentTool(tool),
    setReadonly: (readonly) => editor.updateInstanceState({ isReadonly: readonly }),
    zoomIn: () => editor.zoomIn(),
    zoomOut: () => editor.zoomOut(),
    zoomToBounds: (bounds, options) => editor.zoomToBounds(bounds, options),
  }
}

export default function MermaidCanvas({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null)
  const cleanup = useRef<() => void>(() => {})
  const [error, setError] = useState("")
  const [height, setHeight] = useState(minimumDiagramHeight)
  const [ready, setReady] = useState(false)
  const controllerRef = useRef<ReturnType<typeof createMermaidController> | null>(null)

  useEffect(() => () => cleanup.current(), [])

  const onMount = useCallback((editor: Editor) => {
    cleanup.current()
    if (!host.current) return
    const hostElement = host.current
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const controller = createMermaidController({
      createDiagram: (text, options) => createMermaidDiagram(editor, text, options),
      createResizeObserver: (callback) => createDiagramResizeObserver(callback, hostElement),
      editor: controllerEditor(editor),
      host: hostElement,
      media: {
        get matches() { return media.matches },
        addEventListener: (_type, listener) => media.addEventListener("change", listener),
        removeEventListener: (_type, listener) => media.removeEventListener("change", listener),
      },
      onError: () => setError(renderError),
      onHeight: setHeight,
      onReady: () => setReady(true),
      schedule: (callback) => { requestAnimationFrame(callback) },
      source,
    })
    controllerRef.current = controller
    cleanup.current = controller.dispose
    void controller.start()
  }, [source])

  if (error) return <MermaidSource source={source} error={error} />

  return (
    <div ref={host} className={`mermaid-diagram${ready ? " ready" : " loading"}`} style={ready ? { height } : { minHeight: height }}>
      {!ready && <MermaidSource source={source} />}
      <div className="mermaid-canvas" aria-label="Mermaid diagram">
        <Tldraw
          autoFocus={false}
          colorScheme="system"
          hideUi
          onMount={onMount}
          options={{ edgeScrollSpeed: 0, maxPages: 0 }}
        />
      </div>
      {ready && (
        <div className="mermaid-controls" role="group" aria-label="Diagram zoom controls">
          <Button variant="ghost" size="sm" type="button" aria-label="Zoom out" onClick={() => controllerRef.current?.zoomOut()}>−</Button>
          <Button variant="ghost" size="sm" type="button" aria-label="Fit diagram" onClick={() => controllerRef.current?.fit()}>Fit</Button>
          <Button variant="ghost" size="sm" type="button" aria-label="Zoom in" onClick={() => controllerRef.current?.zoomIn()}>+</Button>
        </div>
      )}
    </div>
  )
}
