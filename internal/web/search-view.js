export function appendHighlightedText(parent, text, highlights, documentObject = globalThis.document) {
  let cursor = 0
  for (const range of highlights || []) {
    const start = Math.max(cursor, Math.min(text.length, range.start))
    const end = Math.max(start, Math.min(text.length, range.end))
    if (start > cursor) parent.append(documentObject.createTextNode(text.slice(cursor, start)))
    if (end > start) {
      const mark = documentObject.createElement("mark")
      mark.className = "search-highlight"
      mark.textContent = text.slice(start, end)
      parent.append(mark)
    }
    cursor = end
  }
  if (cursor < text.length) parent.append(documentObject.createTextNode(text.slice(cursor)))
}

export function createSearchView({ dialog, input, status, results, documentObject = globalThis.document }) {
  if (!dialog || !input || !status || !results || !documentObject) {
    throw new TypeError("Search view elements are required")
  }

  let handlers
  let optionElements = []

  input.setAttribute("role", "combobox")
  input.setAttribute("aria-autocomplete", "list")
  input.setAttribute("aria-controls", results.id)
  input.setAttribute("aria-expanded", "false")
  results.setAttribute("role", "listbox")
  results.setAttribute("aria-label", "Search results")
  status.setAttribute("role", "status")
  status.setAttribute("aria-live", "polite")

  const onInput = () => handlers?.onInput(input.value)
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      handlers?.onMove(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      handlers?.onActivate()
    } else if (event.key === "Escape") {
      event.preventDefault()
      handlers?.onClose()
    }
  }
  const onCancel = (event) => {
    event.preventDefault()
    handlers?.onClose()
  }
  const onBackdrop = (event) => {
    if (event.target === dialog) handlers?.onClose()
  }
  const onResultClick = (event) => {
    const option = event.target.closest?.("[data-search-index]")
    if (!option || !results.contains(option)) return
    handlers?.onResultClick(Number(option.dataset.searchIndex))
  }

  input.addEventListener("input", onInput)
  input.addEventListener("keydown", onKeyDown)
  dialog.addEventListener("cancel", onCancel)
  dialog.addEventListener("click", onBackdrop)
  results.addEventListener("click", onResultClick)

  const setHandlers = (nextHandlers) => {
    handlers = nextHandlers || undefined
  }

  const open = () => {
    if (!dialog.open) dialog.showModal()
    input.setAttribute("aria-expanded", "true")
  }

  const close = () => {
    if (dialog.open) dialog.close()
    input.setAttribute("aria-expanded", "false")
  }

  const focusInput = () => {
    input.focus({ preventScroll: true })
    input.select()
  }

  const clearResults = () => {
    optionElements = []
    results.replaceChildren()
    input.removeAttribute("aria-activedescendant")
  }

  const setStatus = ({ kind = "idle", message = "", detail = "" } = {}) => {
    status.className = `search-status search-status-${kind}${kind === "warning" ? " search-warning" : ""}`
    status.textContent = message
    status.title = detail
  }

  const makeResult = (result, index, kind) => {
    const option = documentObject.createElement("button")
    option.type = "button"
    option.id = `search-option-${index}`
    option.className = `search-result search-result-${kind}`
    option.dataset.searchIndex = String(index)
    option.setAttribute("role", "option")
    option.setAttribute("aria-selected", "false")

    const heading = documentObject.createElement("span")
    heading.className = "search-result-name"
    heading.textContent = result.name || result.path
    option.append(heading)

    const path = documentObject.createElement("span")
    path.className = "search-result-path"
    path.textContent = result.path
    option.append(path)

    if (kind === "content" && result.snippet) {
      const snippet = documentObject.createElement("span")
      snippet.className = "search-result-snippet"
      appendHighlightedText(snippet, result.snippet.text || "", result.snippet.highlights || [], documentObject)
      option.append(snippet)
    }
    optionElements.push(option)
    return option
  }

  const makeGroup = (title, groupResults, kind, startingIndex) => {
    const section = documentObject.createElement("section")
    section.className = `search-group search-group-${kind}`

    const heading = documentObject.createElement("h3")
    heading.className = "search-group-title"
    heading.textContent = `${title} (${groupResults.length})`
    section.append(heading)

    const list = documentObject.createElement("div")
    list.className = "search-list"
    if (groupResults.length) {
      groupResults.forEach((result, offset) => list.append(makeResult(result, startingIndex + offset, kind)))
    } else {
      const empty = documentObject.createElement("p")
      empty.className = "search-empty"
      empty.textContent = "No matches"
      list.append(empty)
    }
    section.append(list)
    return section
  }

  const renderResults = ({ pathResults = [], contentResults = [], activeIndex = -1 }) => {
    clearResults()
    const pathGroup = makeGroup("File paths", pathResults, "path", 0)
    const contentGroup = makeGroup("Content", contentResults, "content", pathResults.length)
    results.append(pathGroup, contentGroup)
    setActive(activeIndex, false)
  }

  const setActive = (index, scroll = true) => {
    optionElements.forEach((option, optionIndex) => {
      const active = optionIndex === index
      option.classList.toggle("active", active)
      option.setAttribute("aria-selected", String(active))
    })
    const activeOption = optionElements[index]
    if (!activeOption) {
      input.removeAttribute("aria-activedescendant")
      return
    }
    input.setAttribute("aria-activedescendant", activeOption.id)
    if (scroll) activeOption.scrollIntoView({ block: "nearest" })
  }

  return { setHandlers, open, close, focusInput, clearResults, setStatus, renderResults, setActive }
}
