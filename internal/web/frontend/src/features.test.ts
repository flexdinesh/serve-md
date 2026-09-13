import assert from "node:assert/strict"
import test from "node:test"

import { mermaidRenderer, parseFeatures } from "./features.ts"

test("feature parsing defaults Mermaid to Excalidraw", () => {
  for (const source of ["{}", '{"mermaidTldraw":false}']) {
    const features = parseFeatures(source)
    assert.ok(features)
    assert.equal(features.mermaidTldraw, false)
    assert.equal(mermaidRenderer(features), "excalidraw")
  }
})

test("feature parsing enables the tldraw Mermaid renderer", () => {
  const features = parseFeatures('{"mermaidTldraw":true}')

  assert.ok(features)
  assert.equal(features.mermaidTldraw, true)
  assert.equal(mermaidRenderer(features), "tldraw")
})

test("feature parsing rejects missing and invalid bootstrap data", () => {
  for (const source of [undefined, null, "", "not json", "[]", '{"mermaidTldraw":"true"}']) {
    assert.equal(parseFeatures(source), null)
  }
})
