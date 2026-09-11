import assert from "node:assert/strict"
import test from "node:test"

import { calculateDiagramHeight } from "./diagram.js"

test("adaptive diagram height preserves bounds and clamps extremes", () => {
  assert.equal(calculateDiagramHeight(800, { w: 776, h: 300 }), 324)
  assert.equal(calculateDiagramHeight(800, { w: 1000, h: 10 }), 240)
  assert.equal(calculateDiagramHeight(800, { w: 100, h: 1000 }), 600)
  assert.equal(calculateDiagramHeight(0, { w: 100, h: 100 }), 240)
})
