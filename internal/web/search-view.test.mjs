import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./search-view.js", import.meta.url), "utf8")
const { appendHighlightedText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

test("highlighted snippets are assembled with text nodes and mark elements", () => {
  const appended = []
  const documentObject = {
    createTextNode(text) { return { kind: "text", text } },
    createElement(tagName) {
      return {
        kind: tagName,
        className: "",
        set textContent(value) { this.text = value },
      }
    },
  }
  const parent = { append(...nodes) { appended.push(...nodes) } }

  appendHighlightedText(parent, "A <script> guide", [{ start: 2, end: 10 }, { start: 11, end: 16 }], documentObject)

  assert.deepEqual(appended.map(({ kind, className, text }) => ({ kind, className, text })), [
    { kind: "text", className: undefined, text: "A " },
    { kind: "mark", className: "search-highlight", text: "<script>" },
    { kind: "text", className: undefined, text: " " },
    { kind: "mark", className: "search-highlight", text: "guide" },
  ])
})

test("overlapping or out-of-range highlights cannot duplicate unsafe markup", () => {
  const appended = []
  const documentObject = {
    createTextNode(text) { return { kind: "text", text } },
    createElement() {
      return { kind: "mark", className: "", set textContent(value) { this.text = value } }
    },
  }
  appendHighlightedText({ append: (...nodes) => appended.push(...nodes) }, "abcdef", [
    { start: -3, end: 2 },
    { start: 1, end: 99 },
  ], documentObject)
  assert.equal(appended.map((node) => node.text).join(""), "abcdef")
})
