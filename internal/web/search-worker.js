/* global importScripts, MiniSearch */
(() => {
  let dependencyError
  if (typeof MiniSearch === "undefined" && typeof importScripts === "function") {
    try {
      importScripts("./vendor/minisearch.min.js")
    } catch (error) {
      dependencyError = error
    }
  }

  const MAX_RESULTS = 10
  const SNIPPET_LENGTH = 180

  const queryTerms = (query) => {
    const matches = query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)
    return [...new Set(matches || [])]
  }

  const occurrencesFor = (content, terms) => {
    const lowerContent = content.toLocaleLowerCase()
    const occurrences = []
    terms.forEach((term, termIndex) => {
      let from = 0
      let count = 0
      while (from < lowerContent.length && count < 100) {
        const position = lowerContent.indexOf(term, from)
        if (position < 0) break
        occurrences.push({ start: position, end: position + term.length, termIndex })
        from = position + Math.max(1, term.length)
        count += 1
      }
    })
    return occurrences.sort((left, right) => left.start - right.start || left.end - right.end)
  }

  const mergeRanges = (ranges) => {
    const merged = []
    for (const range of ranges) {
      const previous = merged.at(-1)
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
      else merged.push({ ...range })
    }
    return merged
  }

  const bestSnippet = (content, query) => {
    const text = String(content || "")
    const terms = queryTerms(query)
    const occurrences = occurrencesFor(text, terms)
    if (!occurrences.length) {
      const clipped = text.length > SNIPPET_LENGTH
      return { text: text.slice(0, SNIPPET_LENGTH) + (clipped ? "…" : ""), highlights: [] }
    }

    let best = { score: -1, start: occurrences[0].start }
    for (const anchor of occurrences) {
      const windowStart = Math.max(0, anchor.start - 60)
      const windowEnd = Math.min(text.length, windowStart + SNIPPET_LENGTH)
      const inside = occurrences.filter((item) => item.start < windowEnd && item.end > windowStart)
      const distinctTerms = new Set(inside.map((item) => item.termIndex)).size
      const score = distinctTerms * 100 + inside.length
      if (score > best.score) best = { score, start: anchor.start }
    }

    let start = Math.max(0, best.start - 60)
    let end = Math.min(text.length, start + SNIPPET_LENGTH)
    if (start > 0) {
      const boundary = text.slice(start, Math.min(end, start + 24)).search(/\s/)
      if (boundary >= 0) start += boundary + 1
    }
    if (end < text.length) {
      const boundary = text.slice(Math.max(start, end - 24), end).search(/\s[^\s]*$/)
      if (boundary >= 0) end = Math.max(start, end - 24) + boundary
    }

    const leadingEllipsis = start > 0 ? "…" : ""
    const trailingEllipsis = end < text.length ? "…" : ""
    const offset = leadingEllipsis.length
    const highlights = mergeRanges(
      occurrences
        .filter((item) => item.start < end && item.end > start)
        .map((item) => ({
          start: Math.max(item.start, start) - start + offset,
          end: Math.min(item.end, end) - start + offset,
        })),
    )
    return {
      text: leadingEllipsis + text.slice(start, end) + trailingEllipsis,
      highlights,
    }
  }

  const createSearchEngine = (MiniSearchClass) => {
    let pathIndex
    let contentIndex

    const initialize = (documents) => {
      pathIndex = new MiniSearchClass({ fields: ["path"], storeFields: ["path", "name"], idField: "path" })
      contentIndex = new MiniSearchClass({ fields: ["content"], storeFields: ["path", "name", "content"], idField: "path" })
      const uniqueDocuments = [...new Map(
        (documents || [])
          .filter((document) => document && typeof document.path === "string")
          .map((document) => [document.path, {
            path: document.path,
            name: typeof document.name === "string" ? document.name : document.path,
            content: typeof document.content === "string" ? document.content : "",
          }]),
      ).values()]
      pathIndex.addAll(uniqueDocuments)
      contentIndex.addAll(uniqueDocuments)
    }

    const search = (query) => {
      if (!pathIndex || !contentIndex) throw new Error("Search index has not been initialized")
      const pathResults = pathIndex.search(query, {
        combineWith: "AND",
        prefix: true,
        fuzzy: (term) => term.length >= 4 ? 0.2 : false,
      }).slice(0, MAX_RESULTS).map((result) => ({
        path: result.path,
        name: result.name,
        score: result.score,
      }))
      const contentResults = contentIndex.search(query, {
        combineWith: "AND",
        prefix: true,
        fuzzy: false,
      }).slice(0, MAX_RESULTS).map((result) => ({
        path: result.path,
        name: result.name,
        score: result.score,
        snippet: bestSnippet(result.content, query),
      }))
      return { pathResults, contentResults }
    }

    return { initialize, search }
  }

  globalThis.ServeMdSearchWorker = { createSearchEngine, bestSnippet, queryTerms }

  if (typeof globalThis.addEventListener === "function" && typeof globalThis.postMessage === "function") {
    let engine
    globalThis.addEventListener("message", (event) => {
      const message = event.data || {}
      try {
        if (dependencyError) throw dependencyError
        if (message.type === "init") {
          engine = createSearchEngine(globalThis.MiniSearch)
          engine.initialize(message.documents)
          globalThis.postMessage({ type: "ready" })
        } else if (message.type === "search") {
          const results = engine.search(message.query)
          globalThis.postMessage({ type: "results", requestId: message.requestId, ...results })
        }
      } catch (_error) {
        globalThis.postMessage({ type: "error", requestId: message.requestId })
      }
    })
  }
})()
