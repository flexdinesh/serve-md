import { useEffect, useRef, useState } from "react"

import {
  createSearchController,
  type SearchHandlers,
  type SearchStatus,
  type SearchView,
} from "./search-controller.ts"
import { highlightedParts } from "./search-highlights.ts"
import {
  isSearchDocumentsResponse,
  type SearchDocumentsResponse,
} from "./search-documents.ts"
import type { HighlightRange, SearchGroups, SearchResult } from "./search-engine.ts"

function HighlightedText({ highlights = [], text = "" }: { highlights?: readonly HighlightRange[]; text?: string }) {
  return highlightedParts(text, highlights).map((part, index) => (
    part.highlighted ? <mark key={index}>{part.text}</mark> : part.text
  ))
}

interface ResultGroupProps {
  activeIndex: number
  kind: "content" | "path"
  offset: number
  onActivate(index: number): void
  results: readonly SearchResult[]
  title: string
}

function ResultGroup({ activeIndex, kind, offset, onActivate, results, title }: ResultGroupProps) {
  return (
    <section className={`search-group search-group-${kind}`}>
      <h3 className="search-group-title">{title} ({results.length})</h3>
      <div className="search-list">
        {results.length ? results.map((result, index) => {
          const resultIndex = offset + index
          const active = resultIndex === activeIndex
          return (
            <button
              key={`${kind}-${result.path}`}
              id={`search-option-${resultIndex}`}
              type="button"
              className={`search-result search-result-${kind}${active ? " active" : ""}`}
              role="option"
              aria-selected={active}
              onClick={() => onActivate(resultIndex)}
            >
              <span className="search-result-name">{result.name || result.path}</span>
              <span className="search-result-path">{result.path}</span>
              {kind === "content" && result.snippet && (
                <span className="search-result-snippet">
                  <HighlightedText text={result.snippet.text} highlights={result.snippet.highlights} />
                </span>
              )}
            </button>
          )
        }) : <p className="search-empty">No matches</p>}
      </div>
    </section>
  )
}

async function fetchDocuments(): Promise<SearchDocumentsResponse> {
  const response = await fetch("/api/search-documents", { headers: { Accept: "application/json" } })
  if (!response.ok) throw new Error(`Search documents request failed: ${response.status}`)
  const payload: unknown = await response.json()
  if (!isSearchDocumentsResponse(payload)) throw new Error("Invalid search documents response")
  return payload
}

interface SearchDialogProps {
  navigate(path: string): void
  registerOpen(open: (() => void) | null): void
}

export function SearchDialog({ navigate, registerOpen }: SearchDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const handlers = useRef<SearchHandlers | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [expanded, setExpanded] = useState(false)
  const [groups, setGroups] = useState<SearchGroups | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<Required<SearchStatus>>({ kind: "idle", message: "", detail: "" })

  useEffect(() => {
    if (!dialog.current || !input.current || typeof Worker === "undefined") return undefined
    const worker = new Worker(new URL("./search-worker.ts", import.meta.url), { type: "module" })
    const view: SearchView = {
      setHandlers(next) { handlers.current = next },
      open() {
        if (!dialog.current?.open) dialog.current?.showModal()
        setExpanded(true)
      },
      close() {
        if (dialog.current?.open) dialog.current.close()
        setExpanded(false)
      },
      focusInput() {
        input.current?.focus({ preventScroll: true })
        input.current?.select()
      },
      clearResults() {
        setGroups(null)
        setActiveIndex(-1)
      },
      setStatus(next = {}) {
        setStatus({ kind: next.kind || "idle", message: next.message || "", detail: next.detail || "" })
      },
      renderResults(next) {
        setGroups({ contentResults: next.contentResults, pathResults: next.pathResults })
        setActiveIndex(next.activeIndex)
      },
      setActive(index, scroll = true) {
        setActiveIndex(index)
        if (scroll) requestAnimationFrame(() => document.querySelector(`#search-option-${index}`)?.scrollIntoView({ block: "nearest" }))
      },
    }
    const controller = createSearchController({
      fetchDocuments,
      navigate(path) {
        view.close()
        navigate(path)
      },
      view,
      worker,
    })
    controller.start()
    registerOpen(controller.open)
    return () => {
      registerOpen(null)
      controller.destroy()
    }
  }, [navigate, registerOpen])

  const activeID = activeIndex >= 0 ? `search-option-${activeIndex}` : undefined

  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-labelledby="search-title"
      onCancel={(event) => { event.preventDefault(); handlers.current?.onClose() }}
      onClick={(event) => { if (event.target === dialog.current) handlers.current?.onClose() }}
    >
      <div className="search-shell">
        <h2 id="search-title" className="visually-hidden">Search Markdown files</h2>
        <div className="search-field">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m12.5 12.5 4 4" />
          </svg>
          <input
            ref={input}
            id="search-input"
            className="search-input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search files and content…"
            role="combobox"
            aria-controls="search-results"
            aria-expanded={expanded}
            aria-autocomplete="list"
            aria-activedescendant={activeID}
            value={query}
            onChange={(event) => { setQuery(event.target.value); handlers.current?.onInput(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                handlers.current?.onMove(event.key === "ArrowDown" ? 1 : -1)
              } else if (event.key === "Enter") {
                event.preventDefault()
                handlers.current?.onActivate()
              } else if (event.key === "Escape") {
                event.preventDefault()
                handlers.current?.onClose()
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className={`search-status search-status-${status.kind}${status.kind === "warning" ? " search-warning" : ""}`} role="status" aria-live="polite" title={status.detail}>
          {status.message}
        </div>
        <div id="search-results" className="search-results" role="listbox" aria-label="Search results">
          {groups && (
            <>
              <ResultGroup activeIndex={activeIndex} kind="path" offset={0} onActivate={(index) => handlers.current?.onResultClick(index)} results={groups.pathResults} title="File paths" />
              <ResultGroup activeIndex={activeIndex} kind="content" offset={groups.pathResults.length} onActivate={(index) => handlers.current?.onResultClick(index)} results={groups.contentResults} title="Content" />
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}
