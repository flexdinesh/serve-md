import { Component, lazy, Suspense, useEffect, useRef, useState } from "react"

import { MermaidSource } from "./MermaidSource.jsx"

const MermaidCanvas = lazy(() => import("./MermaidCanvas.jsx"))

class MermaidBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <MermaidSource source={this.props.source} error="Could not load Mermaid. Check your installation." />
    }
    return this.props.children
  }
}

export function MermaidBlock({ source }) {
  const host = useRef(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") {
      setNearViewport(true)
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setNearViewport(true)
      observer.disconnect()
    }, { rootMargin: "300px 0px" })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={host} className="mermaid-lazy">
      {nearViewport ? (
        <MermaidBoundary source={source}>
          <Suspense fallback={<MermaidSource source={source} />}>
            <MermaidCanvas source={source} />
          </Suspense>
        </MermaidBoundary>
      ) : <MermaidSource source={source} />}
    </div>
  )
}
