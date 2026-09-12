export interface TreeNode {
  children: TreeNode[]
  isDir: boolean
  name: string
  open: boolean
  path: string
  selected: boolean
}

export interface PageData {
  content: string
  empty: boolean
  error: string
  hasFile: boolean
  rootName: string
  selected: string
  tree: TreeNode[]
  warnings: string[]
}

export type PageLoadResult =
  | { kind: "page"; page: PageData }
  | { kind: "failure"; message: string }

export const emptyPage: PageData = {
  content: "",
  empty: false,
  error: "",
  hasFile: false,
  rootName: "",
  selected: "",
  tree: [],
  warnings: [],
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

export function isPageLoadResult(value: unknown): value is PageLoadResult {
  if (!isRecord(value) || typeof value.kind !== "string") return false
  if (value.kind === "page") return isPageData(value.page)
  return value.kind === "failure" && typeof value.message === "string"
}

function readInitialPageData(): PageData | null {
  const source = document.querySelector<HTMLTemplateElement>("#app-data")?.content.textContent.trim()
  if (!source?.startsWith("{")) return null
  try {
    const data: unknown = JSON.parse(source)
    return isPageData(data) ? data : null
  } catch {
    return null
  }
}

let initialPageData = readInitialPageData()

interface LoadPageOptions {
  pathname: string
  selected: string
  signal: AbortSignal
}

export async function loadPage({ pathname, selected, signal }: LoadPageOptions): Promise<PageLoadResult> {
  const embedded = initialPageData
  initialPageData = null
  if (embedded && embedded.selected === selected && (pathname === "/" || pathname === "/view")) {
    return { kind: "page", page: embedded }
  }

  const endpoint = pathname === "/view"
    ? `/api/page?path=${encodeURIComponent(selected)}`
    : "/api/page"

  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal })
    const payload: unknown = await response.json()
    return isPageData(payload)
      ? { kind: "page", page: payload }
      : { kind: "failure", message: "The server returned an invalid page response." }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") throw error
    return { kind: "failure", message: "Could not load Markdown files." }
  }
}

export function openDirectoryPaths(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.isDir && node.open ? [node.path] : []),
    ...openDirectoryPaths(node.children),
  ])
}
