import { useEffect, useState } from "react"

import { MarkdownDocument } from "./MarkdownDocument.jsx"
import { SearchDialog } from "./SearchDialog.jsx"

function TreeNodes({ nodes }) {
  return nodes.map((node) => (
    <li key={node.path}>
      {node.isDir ? (
        <details defaultOpen={node.open}>
          <summary>{node.name}/</summary>
          <ul><TreeNodes nodes={node.children} /></ul>
        </details>
      ) : (
        <a
          className={node.selected ? "selected" : undefined}
          aria-current={node.selected ? "page" : undefined}
          href={`/view?path=${encodeURIComponent(node.path)}`}
        >
          {node.name}
        </a>
      )}
    </li>
  ))
}

function pageEndpoint() {
  if (window.location.pathname !== "/view") return "/api/page"
  const selected = new URLSearchParams(window.location.search).get("path") || ""
  return `/api/page?path=${encodeURIComponent(selected)}`
}

function initialPageData() {
  const source = document.querySelector("#app-data")?.content.textContent.trim()
  if (!source?.startsWith("{")) return null
  try {
    const data = JSON.parse(source)
    return Array.isArray(data.tree) && Array.isArray(data.warnings) ? data : null
  } catch {
    return null
  }
}

export function App() {
  const [data, setData] = useState(initialPageData)

  useEffect(() => {
    if (data) return undefined
    const controller = new AbortController()
    fetch(pageEndpoint(), { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!payload || !Array.isArray(payload.tree) || !Array.isArray(payload.warnings)) {
          throw new Error("Invalid page response")
        }
        setData(payload)
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setData({ content: "", empty: true, error: "Could not load Markdown files.", hasFile: false, rootName: "", selected: "", tree: [], warnings: [] })
        }
      })
    return () => controller.abort()
  }, [data])

  useEffect(() => {
    document.title = `${data?.selected ? `${data.selected} · ` : ""}serve-md`
  }, [data?.selected])

  const page = data || { content: "", empty: false, error: "", hasFile: false, rootName: "", selected: "", tree: [], warnings: [] }

  return (
    <>
      <header><a href="/">serve-md</a><span>{page.rootName}</span></header>
      <div className="layout">
        <aside aria-label="Markdown files">
          <div className="tree-title">Markdown files</div>
          {!data ? <p className="muted">Loading Markdown files…</p> : page.empty ? <p className="muted">No Markdown files found.</p> : <ul className="tree"><TreeNodes nodes={page.tree} /></ul>}
          {page.warnings.length > 0 && (
            <details className="warnings">
              <summary>Some paths could not be read</summary>
              <ul>{page.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}
        </aside>
        <main>
          {page.error && <div className="error" role="alert">{page.error}</div>}
          {page.hasFile ? <MarkdownDocument key={page.selected} html={page.content} /> : data && !page.error ? <div className="empty">Select a Markdown file from the folder tree.</div> : null}
        </main>
      </div>
      <SearchDialog navigate={navigateToDocument} />
    </>
  )
}

function navigateToDocument(path) {
  window.location.assign(`/view?path=${encodeURIComponent(path)}`)
}
