import { type MouseEvent, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { MermaidBlock } from "./MermaidBlock.tsx"

interface DiagramPortal {
  host: HTMLDivElement
  key: number
  source: string
}

interface MarkdownDocumentProps {
  html: string
  navigate(href: string): void
}

function internalDocumentHref(event: MouseEvent<HTMLElement>): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null
  }
  if (!(event.target instanceof Element)) return null
  const anchor = event.target.closest("a")
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return null
  if (anchor.target && anchor.target !== "_self") return null
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin || url.pathname !== "/view") return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function MarkdownDocument({ html, navigate }: MarkdownDocumentProps) {
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
  }, [html])

  return (
    <>
      <article
        ref={article}
        dangerouslySetInnerHTML={renderedHTML}
        onClick={(event) => {
          const href = internalDocumentHref(event)
          if (!href) return
          event.preventDefault()
          navigate(href)
        }}
      />
      {diagrams.map(({ host, key, source }) => createPortal(<MermaidBlock source={source} />, host, key))}
    </>
  )
}
