import { createMermaidDiagram } from "@tldraw/mermaid"
import { useCallback, useEffect, useRef, useState } from "react"
import { Tldraw } from "tldraw"
import "tldraw/tldraw.css"

import { minimumDiagramHeight } from "./diagram.js"
import { createMermaidController } from "./mermaid-controller.js"
import { MermaidSource } from "./MermaidSource.jsx"

const renderError = "Could not render Mermaid diagram. Check its source."

function createDiagramResizeObserver(resize) {
  if (typeof ResizeObserver !== "undefined") return new ResizeObserver(resize)
  window.addEventListener("resize", resize)
  return {
    disconnect: () => window.removeEventListener("resize", resize),
    observe: resize,
  }
}

export default function MermaidCanvas({ source }) {
  const host = useRef(null)
  const cleanup = useRef(() => {})
  const [error, setError] = useState("")
  const [height, setHeight] = useState(minimumDiagramHeight)
  const [ready, setReady] = useState(false)
  const controllerRef = useRef(null)

  useEffect(() => () => cleanup.current(), [])

  const onMount = useCallback((editor) => {
    cleanup.current()
    if (!host.current) return
    const controller = createMermaidController({
      createDiagram: createMermaidDiagram,
      createResizeObserver: createDiagramResizeObserver,
      editor,
      host: host.current,
      media: window.matchMedia("(prefers-color-scheme: dark)"),
      onError: () => setError(renderError),
      onHeight: setHeight,
      onReady: () => setReady(true),
      schedule: requestAnimationFrame,
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
          <button type="button" aria-label="Zoom out" onClick={() => controllerRef.current?.zoomOut()}>−</button>
          <button type="button" aria-label="Fit diagram" onClick={() => controllerRef.current?.fit()}>Fit</button>
          <button type="button" aria-label="Zoom in" onClick={() => controllerRef.current?.zoomIn()}>+</button>
        </div>
      )}
    </div>
  )
}
