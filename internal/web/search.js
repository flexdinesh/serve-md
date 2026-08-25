import { createSearchController } from "./search-controller.js"
import { createSearchView } from "./search-view.js"

async function fetchDocuments() {
  const response = await fetch("/api/search-documents", {
    headers: { Accept: "application/json" },
  })
  if (!response.ok) throw new Error(`Search documents request failed: ${response.status}`)
  const payload = await response.json()
  if (!payload || !Array.isArray(payload.documents)) throw new Error("Invalid search documents response")
  return payload
}

function startSearch() {
  const dialog = document.querySelector("#search-dialog")
  const input = document.querySelector("#search-input")
  const status = document.querySelector("#search-status")
  const results = document.querySelector("#search-results")
  if (!dialog || !input || !status || !results || typeof Worker === "undefined") return

  const view = createSearchView({ dialog, input, status, results })
  const worker = new Worker(new URL("./search-worker.js", import.meta.url))
  const controller = createSearchController({
    view,
    worker,
    fetchDocuments,
    navigate: (path) => window.location.assign(`/view?path=${encodeURIComponent(path)}`),
    shortcutTarget: document,
  })
  controller.start()
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startSearch, { once: true })
else startSearch()
