import assert from "node:assert/strict"
import test from "node:test"

import MiniSearch from "minisearch"

import { bestSnippet, createSearchEngine } from "./search-engine.js"

test("path and content matches are returned as independent groups", () => {
  const engine = createSearchEngine(MiniSearch)
  engine.initialize([
    { path: "docs/guide.md", name: "guide.md", content: "The guide explains alpha and beta." },
    { path: "notes/alpha.md", name: "alpha.md", content: "alpha only" },
  ])

  const guideResults = engine.search("guide")
  assert.deepEqual(guideResults.pathResults.map((result) => result.path), ["docs/guide.md"])
  assert.deepEqual(guideResults.contentResults.map((result) => result.path), ["docs/guide.md"])
  assert.deepEqual(engine.search("alpha beta").contentResults.map((result) => result.path), ["docs/guide.md"])
})

test("path search supports prefix and mild fuzzy matching", () => {
  const engine = createSearchEngine(MiniSearch)
  engine.initialize([{ path: "reference/configuration.md", name: "configuration.md", content: "Settings" }])

  assert.equal(engine.search("config").pathResults[0].path, "reference/configuration.md")
  assert.equal(engine.search("configuraton").pathResults[0].path, "reference/configuration.md")
})

test("results are capped at ten per group", () => {
  const engine = createSearchEngine(MiniSearch)
  engine.initialize(Array.from({ length: 15 }, (_, index) => ({
    path: `guide-${index}.md`,
    name: `guide-${index}.md`,
    content: `guide content ${index}`,
  })))
  const results = engine.search("guide")
  assert.equal(results.pathResults.length, 10)
  assert.equal(results.contentResults.length, 10)
})

test("the best content snippet includes safe highlight ranges", () => {
  const snippet = bestSnippet("A long introduction. Alpha appears near beta in this useful section.", "alpha beta")
  assert.match(snippet.text, /Alpha/)
  assert.match(snippet.text, /beta/)
  assert.equal(snippet.highlights.length, 2)
  assert.deepEqual(snippet.highlights.map((range) => snippet.text.slice(range.start, range.end).toLowerCase()), ["alpha", "beta"])
})
