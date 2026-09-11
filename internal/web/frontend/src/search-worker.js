import MiniSearch from "minisearch"

import { createSearchEngine } from "./search-engine.js"

let engine

self.addEventListener("message", (event) => {
  const message = event.data || {}
  try {
    if (message.type === "init") {
      engine = createSearchEngine(MiniSearch)
      engine.initialize(message.documents)
      self.postMessage({ type: "ready" })
    } else if (message.type === "search") {
      const results = engine.search(message.query)
      self.postMessage({ type: "results", requestId: message.requestId, ...results })
    }
  } catch {
    self.postMessage({ type: "error", requestId: message.requestId })
  }
})
