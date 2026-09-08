import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./mermaid.js", import.meta.url), "utf8")
const { startMermaid } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

class Element {
  children = []
  attributes = {}
  constructor(tagName) { this.tagName = tagName }
  append(...children) {
    for (const child of children) {
      child.remove()
      child.parentElement = this
      this.children.push(child)
    }
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this)
      this.parentElement = undefined
    }
  }
  replaceWith(replacement) {
    const parent = this.parentElement
    const index = parent.children.indexOf(this)
    this.remove()
    replacement.parentElement = parent
    parent.children.splice(index, 0, replacement)
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove()
    this.append(...children)
  }
  setAttribute(name, value) { this.attributes[name] = value }
}

function setup(sources, render = async (id) => ({ svg: `<svg id="${id}"></svg>` })) {
  const article = new Element("article")
  const blocks = sources.map((source) => {
    const pre = new Element("pre")
    const code = new Element("code")
    code.textContent = source
    pre.append(code)
    article.append(pre)
    return code
  })
  const body = new Element("body")
  body.append(article)
  const documentObject = {
    body,
    createElement: (tagName) => new Element(tagName),
    querySelectorAll(selector) {
      assert.equal(selector, "article pre > code.language-mermaid")
      return blocks
    },
  }
  let onChange
  const media = {
    matches: false,
    addEventListener(type, listener) {
      assert.equal(type, "change")
      onChange = listener
    },
    change(dark) { this.matches = dark; return onChange() },
  }
  const configs = []
  const renders = []
  let loads = 0
  const loadMermaid = async () => {
    loads += 1
    return { default: {
      initialize: (config) => configs.push(config),
      render: (...args) => { renders.push(args); return render(...args) },
    } }
  }
  return { documentObject, media, loadMermaid, article, body, blocks, configs, renders, loads: () => loads }
}

test("pages without Mermaid never load the CDN library", async () => {
  const harness = setup([])
  await startMermaid(harness)
  assert.equal(harness.loads(), 0)
  assert.equal(harness.configs.length, 0)
})

test("renders all diagrams from exact text with unique SVG IDs and strict security", async () => {
  const sources = ['graph LR\nA["<script>alert(1)</script> & text"] --> B', "sequenceDiagram\nA->>B: Hello"]
  const harness = setup(sources)
  await startMermaid(harness)
  assert.equal(harness.loads(), 1)
  assert.deepEqual(harness.renders.map(([, source]) => source), sources)
  assert.equal(new Set(harness.renders.map(([id]) => id)).size, 2)
  assert.equal(harness.configs[0].securityLevel, "strict")
  assert.equal(harness.configs[0].startOnLoad, false)
  assert.equal(harness.configs[0].suppressErrorRendering, true)
  assert.equal(harness.configs[0].maxTextSize, undefined)
  assert.equal(harness.configs[0].maxEdges, undefined)
  for (const host of harness.article.children) {
    assert.equal(host.children.length, 1)
    assert.match(host.children[0].innerHTML, /^<svg/)
  }
  assert.deepEqual(harness.body.children, [harness.article])
})

test("CDN failure leaves every source readable with a short text error", async () => {
  const harness = setup(["graph LR\nA --> B", "sequenceDiagram\nA->>B: Hello"])
  await startMermaid({ ...harness, loadMermaid: async () => { throw new Error("<unsafe error>") } })
  for (const [index, host] of harness.article.children.entries()) {
    assert.equal(host.children[0].children[0], harness.blocks[index])
    assert.match(host.children[1].textContent, /Could not load Mermaid/)
    assert.equal(host.children[1].innerHTML, undefined)
  }
})

test("invalid diagrams preserve source without blocking later diagrams or leaving staging nodes", async () => {
  const harness = setup(["invalid", "graph LR\nA --> B"], async (id, source) => {
    if (source === "invalid") throw new Error("parse failed")
    return { svg: `<svg id="${id}"></svg>` }
  })
  await startMermaid(harness)
  const [failed, success] = harness.article.children
  assert.equal(failed.children[0].children[0].textContent, "invalid")
  assert.match(failed.children[1].textContent, /Could not render/)
  assert.match(success.children[0].innerHTML, /^<svg/)
  assert.deepEqual(harness.body.children, [harness.article])
})

test("theme changes rerender original source without duplicating diagrams", async () => {
  const harness = setup(["graph LR\nA --> B"])
  await startMermaid(harness)
  await harness.media.change(true)
  await harness.media.change(false)
  assert.deepEqual(harness.configs.map(({ theme }) => theme), ["default", "dark", "default"])
  assert.equal(harness.loads(), 1)
  assert.equal(harness.article.children.length, 1)
  assert.equal(harness.article.children[0].children.length, 1)
  assert.deepEqual(harness.renders.map(([, source]) => source), Array(3).fill("graph LR\nA --> B"))
})

test("theme changes during rendering discard stale SVGs and serialize rendering", async () => {
  let finishFirst
  let renderCount = 0
  const harness = setup(["graph LR\nA --> B"], async () => {
    renderCount += 1
    if (renderCount === 1) return new Promise((resolve) => { finishFirst = resolve })
    return { svg: "<svg>dark</svg>" }
  })
  const initial = startMermaid(harness)
  await Promise.resolve()
  await Promise.resolve()
  const themeChanged = harness.media.change(true)
  assert.equal(renderCount, 1)
  assert.equal(harness.article.children[0].children[0].tagName, "pre")
  finishFirst({ svg: "<svg>stale light</svg>" })
  await Promise.all([initial, themeChanged])
  assert.equal(renderCount, 2)
  assert.equal(harness.article.children[0].children[0].innerHTML, "<svg>dark</svg>")
  assert.deepEqual(harness.body.children, [harness.article])
})
