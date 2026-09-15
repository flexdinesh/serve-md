import assert from "node:assert/strict"
import test from "node:test"

import {
  createSearchController,
  type SearchHandlers,
  type SearchStatus,
  type SearchView,
  type SearchWorker,
  type SearchWorkerRequest,
} from "./search-controller.ts"
import type { SearchGroups } from "./search-engine.ts"

class ShortcutEvent extends Event {
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly key: string
  readonly metaKey: boolean
  prevented = false

  constructor({ altKey = false, ctrlKey = false, key, metaKey = false }: {
    altKey?: boolean
    ctrlKey?: boolean
    key: string
    metaKey?: boolean
  }) {
    super("keydown")
    this.altKey = altKey
    this.ctrlKey = ctrlKey
    this.key = key
    this.metaKey = metaKey
  }

  preventDefault(): void {
    this.prevented = true
  }
}

class WorkerFake extends EventTarget implements SearchWorker {
  messages: SearchWorkerRequest[] = []

  postMessage(message: SearchWorkerRequest): void {
    this.messages.push(message)
  }

  emit(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }
}

function nextTimer(timers: Array<() => void>): void {
  const callback = timers.shift()
  assert.ok(callback)
  callback()
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function lastSearchRequest(worker: WorkerFake): Extract<SearchWorkerRequest, { type: "search" }> {
  const message = worker.messages.at(-1)
  assert.ok(message)
  assert.equal(message.type, "search")
  if (message.type !== "search") throw new Error("expected search request")
  return message
}

function setup({ warnings = [] }: { warnings?: string[] } = {}) {
  const target = new EventTarget()
  const worker = new WorkerFake()
  const timers: Array<() => void> = []
  const navigations: string[] = []
  const rendered: Array<SearchGroups & { activeIndex: number }> = []
  const statuses: SearchStatus[] = []
  const activeSelections: number[] = []
  const calls: string[] = []
  let fetchCount = 0
  let currentHandlers: SearchHandlers | null = null
  const view: SearchView = {
    setHandlers(handlers) { currentHandlers = handlers },
    open() { calls.push("open") },
    close() { calls.push("close") },
    focusInput() { calls.push("focus") },
    clearResults() { calls.push("clear") },
    setStatus(status = {}) { statuses.push(status) },
    renderResults(results) { rendered.push(results) },
    setActive(index) { activeSelections.push(index) },
  }
  const controller = createSearchController({
    view,
    worker,
    shortcutTarget: target,
    fetchDocuments: async () => {
      fetchCount += 1
      return { documents: [{ path: "guide.md", name: "guide.md", content: "Guide body" }], warnings }
    },
    navigate: (path) => { navigations.push(path) },
    setTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    clearTimer: () => {},
  })
  controller.start()
  return {
    activeSelections,
    calls,
    controller,
    fetchCount: () => fetchCount,
    handlers() {
      assert.ok(currentHandlers)
      return currentHandlers
    },
    navigations,
    rendered,
    statuses,
    target,
    timers,
    worker,
  }
}

test("Cmd/Ctrl+K opens the palette and loads documents only once", async () => {
  const harness = setup()
  const meta = new ShortcutEvent({ key: "k", metaKey: true })
  const control = new ShortcutEvent({ key: "K", ctrlKey: true })
  harness.target.dispatchEvent(meta)
  harness.target.dispatchEvent(control)
  await flushPromises()

  assert.equal(Number(meta.prevented) + Number(control.prevented), 2)
  assert.equal(harness.fetchCount(), 1)
  assert.equal(harness.worker.messages.filter((message) => message.type === "init").length, 1)
  assert.equal(harness.calls.filter((name) => name === "open").length, 2)
})

test("stale worker responses are ignored and each group is capped at ten", async () => {
  const harness = setup()
  harness.controller.open()
  await flushPromises()
  harness.worker.emit({ type: "ready" })

  harness.handlers().onInput("guide")
  nextTimer(harness.timers)
  const firstRequest = lastSearchRequest(harness.worker).requestId
  harness.handlers().onInput("guides")
  nextTimer(harness.timers)
  const secondRequest = lastSearchRequest(harness.worker).requestId

  harness.worker.emit({
    type: "results",
    requestId: firstRequest,
    pathResults: [{ path: "stale.md", name: "stale.md", score: 1 }],
    contentResults: [],
  })
  assert.equal(harness.rendered.length, 0)

  const pathResults = Array.from({ length: 12 }, (_, index) => ({ path: `path-${index}.md`, name: `path-${index}.md`, score: 1 }))
  const contentResults = Array.from({ length: 12 }, (_, index) => ({ path: `content-${index}.md`, name: `content-${index}.md`, score: 1 }))
  harness.worker.emit({ type: "results", requestId: secondRequest, pathResults, contentResults })

  const results = harness.rendered[0]
  assert.ok(results)
  assert.equal(results.pathResults.length, 10)
  assert.equal(results.contentResults.length, 10)
  assert.equal(results.activeIndex, 0)
})

test("keyboard selection traverses both groups and activation navigates", async () => {
  const harness = setup()
  harness.controller.open()
  await flushPromises()
  harness.worker.emit({ type: "ready" })
  harness.handlers().onInput("guide")
  nextTimer(harness.timers)
  const requestId = lastSearchRequest(harness.worker).requestId
  harness.worker.emit({
    type: "results",
    requestId,
    pathResults: [{ path: "guide.md", name: "guide.md", score: 1 }],
    contentResults: [{ path: "guide.md", name: "guide.md", score: 1, snippet: { text: "guide", highlights: [] } }],
  })

  harness.handlers().onMove(1)
  harness.handlers().onActivate()
  assert.deepEqual(harness.navigations, ["guide.md"])
  assert.equal(harness.activeSelections.at(-1), 1)
})

test("partial index warnings are presented after results", async () => {
  const harness = setup({ warnings: ["unreadable.md: permission denied"] })
  harness.controller.open()
  await flushPromises()
  harness.worker.emit({ type: "ready" })
  harness.handlers().onInput("guide")
  nextTimer(harness.timers)
  const requestId = lastSearchRequest(harness.worker).requestId
  harness.worker.emit({
    type: "results",
    requestId,
    pathResults: [{ path: "guide.md", name: "guide.md", score: 1 }],
    contentResults: [],
  })

  const status = harness.statuses.at(-1)
  assert.ok(status)
  assert.equal(status.kind, "warning")
  assert.match(status.detail || "", /unreadable/)
})
