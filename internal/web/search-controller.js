export function createSearchController({
  view,
  worker,
  fetchDocuments,
  navigate,
  shortcutTarget = globalThis.document,
  debounceMs = 120,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}) {
  if (!view || !worker || !fetchDocuments || !navigate || !shortcutTarget) {
    throw new TypeError("Search controller dependencies are required")
  }

  let started = false
  let loading
  let ready = false
  let unavailable = false
  let warnings = []
  let query = ""
  let debounceTimer
  let nextRequestId = 0
  let activeRequestId = 0
  let flattenedResults = []
  let activeIndex = -1

  const renderEmptyQuery = () => {
    flattenedResults = []
    activeIndex = -1
    view.clearResults()
    view.setStatus({ kind: "idle", message: "Type to search file paths and content." })
  }

  const fail = (message = "Search is unavailable.") => {
    ready = false
    unavailable = true
    flattenedResults = []
    activeIndex = -1
    view.clearResults()
    view.setStatus({ kind: "error", message })
  }

  const requestSearch = (requestedQuery, requestId) => {
    if (!ready || unavailable || requestedQuery !== query || !requestedQuery.trim()) return
    view.setStatus({ kind: "searching", message: "Searching…" })
    worker.postMessage({ type: "search", requestId, query: requestedQuery })
  }

  const scheduleSearch = (nextQuery) => {
    query = nextQuery
    activeRequestId = ++nextRequestId
    if (debounceTimer !== undefined) clearTimer(debounceTimer)
    debounceTimer = undefined

    if (!query.trim()) {
      renderEmptyQuery()
      return
    }
    if (unavailable) {
      fail()
      return
    }
    if (!ready) {
      view.clearResults()
      view.setStatus({ kind: "loading", message: "Preparing search…" })
      return
    }

    const requestId = activeRequestId
    debounceTimer = setTimer(() => {
      debounceTimer = undefined
      requestSearch(query, requestId)
    }, debounceMs)
  }

  const ensureLoaded = () => {
    if (loading) return loading

    view.setStatus({ kind: "loading", message: "Preparing search…" })
    loading = Promise.resolve()
      .then(fetchDocuments)
      .then((payload) => {
        const documents = Array.isArray(payload?.documents) ? payload.documents : []
        warnings = Array.isArray(payload?.warnings) ? payload.warnings : []
        worker.postMessage({ type: "init", documents })
      })
      .catch(() => fail())
    return loading
  }

  const open = () => {
    view.open()
    view.focusInput()
    if (unavailable) {
      fail()
      return
    }
    ensureLoaded()
    if (ready) scheduleSearch(query)
  }

  const close = () => {
    if (debounceTimer !== undefined) clearTimer(debounceTimer)
    debounceTimer = undefined
    view.close()
  }

  const moveSelection = (delta) => {
    if (!flattenedResults.length) return
    activeIndex = (activeIndex + delta + flattenedResults.length) % flattenedResults.length
    view.setActive(activeIndex)
  }

  const activate = (index = activeIndex) => {
    const result = flattenedResults[index]
    if (result) navigate(result.path)
  }

  const onShortcut = (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault()
      open()
    }
  }

  const onWorkerMessage = (event) => {
    const message = event.data || {}
    if (message.type === "ready") {
      ready = true
      unavailable = false
      if (query.trim()) scheduleSearch(query)
      else renderEmptyQuery()
      return
    }
    if (message.type === "error") {
      if (message.requestId !== undefined && message.requestId !== activeRequestId) return
      fail()
      return
    }
    if (message.type !== "results" || message.requestId !== activeRequestId) return

    const groups = {
      pathResults: Array.isArray(message.pathResults) ? message.pathResults.slice(0, 10) : [],
      contentResults: Array.isArray(message.contentResults) ? message.contentResults.slice(0, 10) : [],
    }
    flattenedResults = [...groups.pathResults, ...groups.contentResults]
    activeIndex = flattenedResults.length ? 0 : -1
    view.renderResults({ ...groups, activeIndex })

    if (warnings.length) {
      view.setStatus({
        kind: "warning",
        message: "Results may be incomplete because some files could not be read.",
        detail: warnings.join("\n"),
      })
    } else if (!flattenedResults.length) {
      view.setStatus({ kind: "empty", message: "No matches found." })
    } else {
      view.setStatus()
    }
  }

  const onWorkerError = () => fail()

  const start = () => {
    if (started) return
    started = true
    view.setHandlers({
      onInput: scheduleSearch,
      onMove: moveSelection,
      onActivate: activate,
      onClose: close,
      onResultClick: activate,
    })
    shortcutTarget.addEventListener("keydown", onShortcut)
    worker.addEventListener("message", onWorkerMessage)
    worker.addEventListener("error", onWorkerError)
  }

  const destroy = () => {
    if (!started) return
    close()
    started = false
    shortcutTarget.removeEventListener("keydown", onShortcut)
    worker.removeEventListener("message", onWorkerMessage)
    worker.removeEventListener("error", onWorkerError)
    view.setHandlers(null)
    worker.terminate?.()
  }

  return { start, destroy, open, close }
}
