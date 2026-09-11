import { useEffect, useState } from "react"

import { MarkdownDocument } from "./MarkdownDocument.tsx"
import { SearchDialog } from "./SearchDialog.tsx"

interface TreeNode {
  children: TreeNode[]
  isDir: boolean
  name: string
  open: boolean
  path: string
  selected: boolean
}

interface PageData {
  content: string
  empty: boolean
  error: string
  hasFile: boolean
  rootName: string
  selected: string
  tree: TreeNode[]
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isTreeNode(value: unknown): value is TreeNode {
  return isRecord(value)
    && Array.isArray(value.children)
    && value.children.every(isTreeNode)
    && typeof value.isDir === "boolean"
    && typeof value.name === "string"
    && typeof value.open === "boolean"
    && typeof value.path === "string"
    && typeof value.selected === "boolean"
}

function isPageData(value: unknown): value is PageData {
  return isRecord(value)
    && typeof value.content === "string"
    && typeof value.empty === "boolean"
    && typeof value.error === "string"
    && typeof value.hasFile === "boolean"
    && typeof value.rootName === "string"
    && typeof value.selected === "string"
    && Array.isArray(value.tree)
    && value.tree.every(isTreeNode)
    && Array.isArray(value.warnings)
    && value.warnings.every((warning) => typeof warning === "string")
}

function TreeNodes({ nodes }: { nodes: readonly TreeNode[] }) {
  return nodes.map((node) => (
    <li key={node.path}>
      {node.isDir ? (
        <details open={node.open}>
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

function pageEndpoint(): string {
  if (window.location.pathname !== "/view") return "/api/page"
  const selected = new URLSearchParams(window.location.search).get("path") || ""
  return `/api/page?path=${encodeURIComponent(selected)}`
}

function initialPageData(): PageData | null {
  const source = document.querySelector<HTMLTemplateElement>("#app-data")?.content.textContent.trim()
  if (!source?.startsWith("{")) return null
  try {
    const data: unknown = JSON.parse(source)
    return isPageData(data) ? data : null
  } catch {
    return null
  }
}

const emptyPage: PageData = {
  content: "",
  empty: false,
  error: "",
  hasFile: false,
  rootName: "",
  selected: "",
  tree: [],
  warnings: [],
}

export function App() {
  const [data, setData] = useState<PageData | null>(initialPageData)

  useEffect(() => {
    if (data) return undefined
    const controller = new AbortController()
    fetch(pageEndpoint(), { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json()
        if (!isPageData(payload)) throw new Error("Invalid page response")
        setData(payload)
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          setData({ ...emptyPage, empty: true, error: "Could not load Markdown files." })
        }
      })
    return () => controller.abort()
  }, [data])

  useEffect(() => {
    document.title = `${data?.selected ? `${data.selected} · ` : ""}serve-md`
  }, [data?.selected])

  const page = data || emptyPage

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

function navigateToDocument(path: string): void {
  window.location.assign(`/view?path=${encodeURIComponent(path)}`)
}
