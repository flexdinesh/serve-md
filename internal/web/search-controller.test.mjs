import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./search-controller.js", import.meta.url), "utf8")
const { createSearchController } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

class EventTargetFake {
  listeners = new Map()

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener))
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event)
  }
}

class WorkerFake extends EventTargetFake {
  messages = []

  postMessage(message) {
    this.messages.push(message)
  }
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setup({ warnings = [] } = {}) {
  const target = new EventTargetFake()
  const worker = new WorkerFake()
  const timers = []
  const navigations = []
  let fetchCount = 0
  const calls = []
  const view = {
    setHandlers(handlers) { this.handlers = handlers },
    open() { calls.push(["open"]) },
    close() { calls.push(["close"]) },
    focusInput() { calls.push(["focus"]) },
    clearResults() { calls.push(["clear"]) },
    setStatus(status) { calls.push(["status", status]) },
    renderResults(results) { calls.push(["results", results]) },
    setActive(index) { calls.push(["active", index]) },
  }
  const controller = createSearchController({
    view,
    worker,
    shortcutTarget: target,
    fetchDocuments: async () => {
      fetchCount += 1
      return { documents: [{ path: "guide.md", name: "guide.md", content: "Guide body" }], warnings }
    },
    navigate: (path) => navigations.push(path),
    setTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    clearTimer: () => {},
  })
  controller.start()
  return { controller, target, worker, view, calls, timers, navigations, fetchCount: () => fetchCount }
}

test("Cmd/Ctrl+K opens the palette and loads documents only once", async () => {
  const harness = setup()
  let prevented = 0
  harness.target.emit("keydown", { key: "k", metaKey: true, ctrlKey: false, altKey: false, preventDefault: () => prevented++ })
  harness.target.emit("keydown", { key: "K", metaKey: false, ctrlKey: true, altKey: false, preventDefault: () => prevented++ })
  await flushPromises()

  assert.equal(prevented, 2)
  assert.equal(harness.fetchCount(), 1)
  assert.equal(harness.worker.messages.filter((message) => message.type === "init").length, 1)
  assert.equal(harness.calls.filter(([name]) => name === "open").length, 2)
})

test("stale worker responses are ignored and each group is capped at ten", async () => {
  const harness = setup()
  harness.controller.open()
  await flushPromises()
  harness.worker.emit("message", { data: { type: "ready" } })

  harness.view.handlers.onInput("guide")
  harness.timers.shift()()
  const firstRequest = harness.worker.messages.at(-1).requestId
  harness.view.handlers.onInput("guides")
  harness.timers.shift()()
  const secondRequest = harness.worker.messages.at(-1).requestId

  harness.worker.emit("message", {
    data: { type: "results", requestId: firstRequest, pathResults: [{ path: "stale.md" }], contentResults: [] },
  })
  assert.equal(harness.calls.filter(([name]) => name === "results").length, 0)

  const pathResults = Array.from({ length: 12 }, (_, index) => ({ path: `path-${index}.md`, name: `path-${index}.md` }))
  const contentResults = Array.from({ length: 12 }, (_, index) => ({ path: `content-${index}.md`, name: `content-${index}.md` }))
  harness.worker.emit("message", { data: { type: "results", requestId: secondRequest, pathResults, contentResults } })

  const rendered = harness.calls.find(([name]) => name === "results")[1]
  assert.equal(rendered.pathResults.length, 10)
  assert.equal(rendered.contentResults.length, 10)
  assert.equal(rendered.activeIndex, 0)
})

test("keyboard selection traverses both groups and activation navigates", async () => {
  const harness = setup()
  harness.controller.open()
  await flushPromises()
  harness.worker.emit("message", { data: { type: "ready" } })
  harness.view.handlers.onInput("guide")
  harness.timers.shift()()
  const requestId = harness.worker.messages.at(-1).requestId
  harness.worker.emit("message", {
    data: {
      type: "results",
      requestId,
      pathResults: [{ path: "guide.md", name: "guide.md" }],
      contentResults: [{ path: "guide.md", name: "guide.md", snippet: { text: "guide", highlights: [] } }],
    },
  })

  harness.view.handlers.onMove(1)
  harness.view.handlers.onActivate()
  assert.deepEqual(harness.navigations, ["guide.md"])
  assert.deepEqual(harness.calls.filter(([name]) => name === "active").at(-1), ["active", 1])
})

test("partial index warnings are presented after results", async () => {
  const harness = setup({ warnings: ["unreadable.md: permission denied"] })
  harness.controller.open()
  await flushPromises()
  harness.worker.emit("message", { data: { type: "ready" } })
  harness.view.handlers.onInput("guide")
  harness.timers.shift()()
  const requestId = harness.worker.messages.at(-1).requestId
  harness.worker.emit("message", {
    data: { type: "results", requestId, pathResults: [{ path: "guide.md" }], contentResults: [] },
  })

  const status = harness.calls.filter(([name]) => name === "status").at(-1)[1]
  assert.equal(status.kind, "warning")
  assert.match(status.detail, /unreadable/)
})
