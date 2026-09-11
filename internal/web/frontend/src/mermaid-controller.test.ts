import assert from "node:assert/strict"
import test from "node:test"

import { createMermaidController, type MermaidControllerEditor } from "./mermaid-controller.ts"

type Call = [string, ...unknown[]]

interface RenderContext {
  shapes: Set<string>
}

interface SetupOptions {
  fallback?: boolean
  render?(context: RenderContext): Promise<void>
}

class Media {
  matches = false
  listeners: Array<() => void> = []

  addEventListener(type: "change", listener: () => void): void {
    assert.equal(type, "change")
    this.listeners.push(listener)
  }

  removeEventListener(type: "change", listener: () => void): void {
    assert.equal(type, "change")
    this.listeners = this.listeners.filter((item) => item !== listener)
  }

  change(matches: boolean): void {
    this.matches = matches
    for (const listener of this.listeners) listener()
  }
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setup({ fallback = false, render }: SetupOptions = {}) {
  const calls: Call[] = []
  const configs: Array<{ config: { theme: "dark" | "default" }; source: string }> = []
  const errors: unknown[] = []
  const heights: number[] = []
  const shapes = new Set<string>()
  const editor: MermaidControllerEditor = {
    clearHistory: () => { calls.push(["history"]) },
    deleteCurrentPageShapes: () => { calls.push(["delete"]); shapes.clear() },
    getCurrentPageBounds: () => ({ x: 0, y: 0, w: 776, h: 300 }),
    hasCurrentPageShapes: () => shapes.size > 0,
    putExternalContent: async ({ text, type }) => { calls.push(["external", type, text]); shapes.add("svg") },
    setCurrentTool: (tool) => { calls.push(["tool", tool]) },
    setReadonly: (readonly) => { calls.push(["state", { isReadonly: readonly }]) },
    zoomIn: () => { calls.push(["zoom", "in"]) },
    zoomOut: () => { calls.push(["zoom", "out"]) },
    zoomToBounds: (bounds, options) => { calls.push(["fit", bounds, options]) },
  }
  const media = new Media()
  let resize: (() => void) | undefined
  const controller = createMermaidController({
    async createDiagram(source, options) {
      configs.push({ config: options.mermaidConfig, source })
      if (render) await render({ shapes })
      else if (fallback) await options.onUnsupportedDiagram("<svg>fallback</svg>")
      else shapes.add("native")
    },
    createResizeObserver(callback) {
      resize = callback
      return {
        disconnect: () => { calls.push(["disconnect"]) },
        observe: () => { calls.push(["observe"]) },
      }
    },
    editor,
    host: { getBoundingClientRect: () => ({ width: 800 }) },
    media,
    onError: (error) => { errors.push(error) },
    onHeight: (height) => { heights.push(height) },
    onReady: () => { calls.push(["ready"]) },
    schedule: (callback) => { callback() },
    source: "graph LR\nA --> B",
  })
  return {
    calls,
    configs,
    controller,
    errors,
    heights,
    media,
    resize() {
      assert.ok(resize)
      resize()
    },
  }
}

test("native diagrams use strict config, become read-only, and fit responsively", async () => {
  const harness = setup()
  await harness.controller.start()
  assert.deepEqual(harness.configs, [{
    source: "graph LR\nA --> B",
    config: {
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "default",
      themeVariables: { darkMode: false },
    },
  }])
  assert.deepEqual(harness.heights, [324])
  assert.deepEqual(harness.calls.filter(([type]) => type === "state").at(-1), ["state", { isReadonly: true }])
  assert.deepEqual(harness.calls.find(([type]) => type === "tool"), ["tool", "hand"])
  const fitCall = harness.calls.find(([type]) => type === "fit")
  assert.ok(fitCall)
  assert.deepEqual(fitCall[2], { inset: 24 })

  harness.controller.zoomOut()
  harness.controller.fit()
  harness.controller.zoomIn()
  harness.resize()
  assert.deepEqual(harness.calls.filter(([type]) => type === "zoom"), [["zoom", "out"], ["zoom", "in"]])
  harness.controller.dispose()
  assert.equal(harness.calls.filter(([type]) => type === "disconnect").length, 1)
})

test("only SVG fallbacks regenerate for system theme changes", async () => {
  const native = setup()
  await native.controller.start()
  native.media.change(true)
  await flushPromises()
  assert.equal(native.configs.length, 1)

  const fallback = setup({ fallback: true })
  await fallback.controller.start()
  fallback.media.change(true)
  await flushPromises()
  assert.deepEqual(fallback.configs.map(({ config }) => config.theme), ["default", "dark"])
  assert.equal(fallback.calls.filter(([type]) => type === "external").length, 2)
  assert.equal(fallback.calls.filter(([type]) => type === "delete").length, 1)
})

test("theme changes during rendering serialize the latest theme", async () => {
  let finishFirst: (() => void) | undefined
  let count = 0
  const harness = setup({
    render: async ({ shapes }) => {
      count += 1
      if (count === 1) await new Promise<void>((resolve) => { finishFirst = resolve })
      shapes.add(`shape-${count}`)
    },
  })
  const starting = harness.controller.start()
  await flushPromises()
  harness.media.change(true)
  assert.equal(count, 1)
  assert.ok(finishFirst)
  finishFirst()
  await starting
  assert.equal(count, 2)
  assert.deepEqual(harness.configs.map(({ config }) => config.theme), ["default", "dark"])
})

test("render failures are reported and never mark the diagram ready", async () => {
  const failure = new Error("bad diagram")
  const harness = setup({ render: async () => { throw failure } })
  await harness.controller.start()
  assert.deepEqual(harness.errors, [failure])
  assert.equal(harness.calls.some(([type]) => type === "ready"), false)
  assert.equal(harness.media.listeners.length, 0)
})
