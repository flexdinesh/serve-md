import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { MermaidBlock } from "./MermaidBlock.jsx"

export function MarkdownDocument({ html }) {
  const article = useRef(null)
  const [diagrams, setDiagrams] = useState([])
  const renderedHTML = useMemo(() => ({ __html: html }), [html])

  useLayoutEffect(() => {
    if (!article.current) return
    const next = [...article.current.querySelectorAll("pre > code.language-mermaid")].map((code, index) => {
      const pre = code.parentElement
      const host = document.createElement("div")
      host.className = "mermaid-portal"
      pre.replaceWith(host)
      return { host, key: index, source: code.textContent ?? "" }
    })
    setDiagrams(next)
  }, [])

  return (
    <>
      <article ref={article} dangerouslySetInnerHTML={renderedHTML} />
      {diagrams.map(({ host, key, source }) => createPortal(<MermaidBlock source={source} />, host, key))}
    </>
  )
}
