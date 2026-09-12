import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

import { ModeToggle } from "./components/ModeToggle.tsx"
import { DocumentPane } from "./DocumentPane.tsx"
import { FileTree } from "./FileTree.tsx"
import {
  emptyPage,
  isPageLoadResult,
  openDirectoryPaths,
  type PageData,
  type PageLoadResult,
} from "./page-data.ts"
import { SearchDialog } from "./SearchDialog.tsx"

function initialPage(result: PageLoadResult): PageData | null {
  return result.kind === "page" ? result.page : null
}

function activePageResult(matches: readonly { loaderData?: unknown }[]): PageLoadResult | null {
  for (let index = matches.length - 1; index >= 0; index--) {
    const loaderData: unknown = matches[index]?.loaderData
    if (isPageLoadResult(loaderData)) return loaderData
  }
  return null
}

export function App() {
  const navigate = useNavigate()
  const router = useRouter()
  const result = useRouterState({ select: (state) => activePageResult(state.matches) })
  const isLoading = useRouterState({ select: (state) => state.isLoading })
  const main = useRef<HTMLElement>(null)
  const openSearch = useRef<() => void>(() => {})
  const focusDocument = useRef(false)
  const [lastPage, setLastPage] = useState<PageData | null>(() => result ? initialPage(result) : null)
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(openDirectoryPaths(result ? initialPage(result)?.tree ?? [] : [])),
  )

  useEffect(() => {
    if (!result || result.kind !== "page") return
    setLastPage(result.page)
    const pathsToOpen = openDirectoryPaths(result.page.tree)
    if (pathsToOpen.length === 0) return
    setExpandedPaths((current) => {
      const next = new Set(current)
      let changed = false
      for (const path of pathsToOpen) {
        if (!next.has(path)) {
          next.add(path)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [result])

  useEffect(() => {
    if (isLoading || !focusDocument.current) return
    focusDocument.current = false
    main.current?.focus({ preventScroll: true })
  }, [isLoading, result])

  const registerSearch = useCallback((open: (() => void) | null) => {
    openSearch.current = open ?? (() => {})
  }, [])

  const navigateToDocument = useCallback((path: string) => {
    focusDocument.current = true
    void navigate({ to: "/view", search: { path }, hash: "" })
  }, [navigate])

  const navigateToHref = useCallback((href: string) => {
    focusDocument.current = true
    void navigate({ href })
  }, [navigate])

  const updateExpanded = useCallback((path: string, expanded: boolean) => {
    setExpandedPaths((current) => {
      if (current.has(path) === expanded) return current
      const next = new Set(current)
      if (expanded) next.add(path)
      else next.delete(path)
      return next
    })
  }, [])

  const page = result?.kind === "page" ? result.page : lastPage ?? emptyPage
  const hasData = result?.kind === "page" || lastPage !== null
  const loadError = result?.kind === "failure" ? result.message : ""

  useEffect(() => {
    document.title = `${page.selected ? `${page.selected} · ` : ""}serve-md`
  }, [page.selected])

  return (
    <>
      <div className={`navigation-progress${isLoading ? " active" : ""}`} aria-hidden="true" />
      <div className="visually-hidden" role="status" aria-live="polite">
        {isLoading ? "Loading document…" : page.selected ? `${page.selected} loaded.` : ""}
      </div>
      <header className="app-header">
        <div className="app-identity">
          <Link className="brand" to="/" search={{}} aria-label="serve-md home">
            <span className="brand-mark" aria-hidden="true">M</span>
            <span>serve-md</span>
          </Link>
          {page.rootName && <span className="root-name" title={page.rootName}>{page.rootName}</span>}
        </div>
        <div className="header-actions">
          <Button
            className="search-trigger"
            type="button"
            variant="outline"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => openSearch.current()}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m12.5 12.5 4 4" />
            </svg>
            <span>Search</span>
            <kbd>⌘ K</kbd>
          </Button>
          <ModeToggle />
        </div>
      </header>
      <div className="layout">
        <FileTree
          expandedPaths={expandedPaths}
          hasData={hasData}
          onExpandedChange={updateExpanded}
          page={page}
        />
        <DocumentPane
          hasData={hasData}
          isLoading={isLoading}
          loadError={loadError}
          main={main}
          navigate={navigateToHref}
          page={page}
          retry={() => { void router.invalidate() }}
        />
      </div>
      <SearchDialog navigate={navigateToDocument} registerOpen={registerSearch} />
    </>
  )
}
