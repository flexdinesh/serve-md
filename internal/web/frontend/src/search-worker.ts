import { createSearchEngine, type SearchDocument } from "./search-engine.ts"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isSearchDocument(value: unknown): value is SearchDocument {
  return isRecord(value)
    && typeof value.path === "string"
    && typeof value.name === "string"
    && typeof value.content === "string"
}

const engine = createSearchEngine()

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data
  if (!isRecord(message)) return

  try {
    if (message.type === "init") {
      const documents = Array.isArray(message.documents) ? message.documents.filter(isSearchDocument) : []
      engine.initialize(documents)
      self.postMessage({ type: "ready" })
    } else if (message.type === "search" && typeof message.query === "string") {
      const results = engine.search(message.query)
      self.postMessage({ type: "results", requestId: message.requestId, ...results })
    }
  } catch {
    self.postMessage({ type: "error", requestId: message.requestId })
  }
})
