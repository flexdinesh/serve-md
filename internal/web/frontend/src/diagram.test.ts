import assert from "node:assert/strict"
import test from "node:test"

import { addTextRasterGutters, calculateDiagramHeight, padTextBounds } from "./diagram.ts"

test("adaptive diagram height preserves bounds and clamps extremes", () => {
  assert.equal(calculateDiagramHeight(800, { w: 776, h: 300 }), 324)
  assert.equal(calculateDiagramHeight(800, { w: 1000, h: 10 }), 240)
  assert.equal(calculateDiagramHeight(800, { w: 100, h: 1000 }), 600)
  assert.equal(calculateDiagramHeight(0, { w: 100, h: 100 }), 240)
})

test("text raster gutters preserve visible content", () => {
  const padded = addTextRasterGutters("Go API & renderer")

  assert.equal(padded, "\u00a0Go API & renderer\u00a0")
  assert.equal(padded.trim(), "Go API & renderer")
})

test("text bounds gain horizontal padding without moving their center", () => {
  const original = { x: 10, width: 100 }
  const padded = padTextBounds(original)

  assert.deepEqual(padded, { x: 6, width: 108 })
  assert.equal(padded.x + padded.width / 2, original.x + original.width / 2)
})
