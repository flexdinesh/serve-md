import type { RefObject } from "react"

import { Button } from "@/components/ui/button"

import { MarkdownDocument } from "./MarkdownDocument.tsx"
import type { PageData } from "./page-data.ts"

interface DocumentPaneProps {
  hasData: boolean
  isLoading: boolean
  loadError: string
  main: RefObject<HTMLElement | null>
  navigate(href: string): void
  page: PageData
  retry(): void
}

export function DocumentPane({ hasData, isLoading, loadError, main, navigate, page, retry }: DocumentPaneProps) {
  return (
    <main id="document-pane" ref={main} tabIndex={-1} aria-busy={isLoading}>
      {loadError ? (
        <div className="error" role="alert">
          <p>{loadError}</p>
          <Button type="button" variant="outline" onClick={retry}>Try again</Button>
        </div>
      ) : page.error ? (
        <div className="error" role="alert">{page.error}</div>
      ) : page.hasFile ? (
        <MarkdownDocument key={page.selected} html={page.content} navigate={navigate} />
      ) : hasData ? (
        <div className="empty">
          <div className="empty-mark" aria-hidden="true">M</div>
          <h1>Choose a Markdown file</h1>
          <p>Select a Markdown file from the folder tree.</p>
        </div>
      ) : null}
    </main>
  )
}
