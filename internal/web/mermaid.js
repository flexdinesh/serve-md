const mermaidURL = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs"

export async function startMermaid({
  documentObject = document,
  media = window.matchMedia("(prefers-color-scheme: dark)"),
  loadMermaid = () => import(mermaidURL),
} = {}) {
  const blocks = [...documentObject.querySelectorAll("article pre > code.language-mermaid")]
  if (blocks.length === 0) return

  const diagrams = blocks.map((code) => {
    const source = code.textContent
    const pre = code.parentElement
    const host = documentObject.createElement("div")
    host.className = "mermaid-diagram"
    pre.replaceWith(host)
    host.append(pre)
    return { source, pre, host }
  })

  function showError(diagram, message) {
    const error = documentObject.createElement("p")
    error.className = "mermaid-error"
    error.setAttribute("role", "status")
    error.textContent = message
    diagram.host.replaceChildren(diagram.pre, error)
  }

  let mermaid
  try {
    const module = await loadMermaid()
    mermaid = module.default
  } catch {
    for (const diagram of diagrams) showError(diagram, "Could not load Mermaid. Check your internet connection and reload.")
    return
  }

  let requested = 0
  let rendered = 0
  let nextID = 0
  let pending

  async function renderLatest() {
    while (rendered !== requested) {
      const version = requested
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: media.matches ? "dark" : "default",
        themeVariables: { darkMode: media.matches, fontFamily: "system-ui, sans-serif" },
      })

      for (const diagram of diagrams) {
        if (version !== requested) break
        const staging = documentObject.createElement("div")
        staging.className = "mermaid-staging"
        staging.setAttribute("aria-hidden", "true")
        documentObject.body.append(staging)
        try {
          const { svg } = await mermaid.render(`serve-md-mermaid-${nextID++}`, diagram.source, staging)
          if (version === requested) {
            const output = documentObject.createElement("div")
            // Only Mermaid's strict-mode SVG is inserted as HTML; source stays text.
            output.innerHTML = svg
            diagram.host.replaceChildren(output)
          }
        } catch {
          if (version === requested) showError(diagram, "Could not render Mermaid diagram. Check its source.")
        } finally {
          staging.remove()
        }
      }
      rendered = version
    }
  }

  function render() {
    requested += 1
    if (!pending) pending = renderLatest().finally(() => { pending = undefined })
    return pending
  }

  media.addEventListener("change", render)
  await render()
}

if (typeof document !== "undefined") void startMermaid()
