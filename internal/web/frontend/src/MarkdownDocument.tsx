import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { MermaidBlock } from "./MermaidBlock.tsx"

interface DiagramPortal {
  host: HTMLDivElement
  key: number
  source: string
}

export function MarkdownDocument({ html }: { html: string }) {
  const article = useRef<HTMLElement>(null)
  const [diagrams, setDiagrams] = useState<DiagramPortal[]>([])
  const renderedHTML = useMemo(() => ({ __html: html }), [html])

  useLayoutEffect(() => {
    if (!article.current) return
    const next = [...article.current.querySelectorAll("pre > code.language-mermaid")].flatMap((code, index) => {
      const pre = code.parentElement
      if (!pre) return []
      const host = document.createElement("div")
      host.className = "mermaid-portal"
      pre.replaceWith(host)
      return [{ host, key: index, source: code.textContent ?? "" }]
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
