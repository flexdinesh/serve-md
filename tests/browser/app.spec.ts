import { expect, test } from "@playwright/test"

test("browses nested Markdown and renders GFM", async ({ page }) => {
  await page.goto("/")

  const tree = page.getByRole("complementary", { name: "Markdown files" })
  await tree.getByText("guides/").click()
  await expect(tree.getByRole("link", { name: "getting-started.md" })).toBeVisible()
  await expect(tree.getByText("notes.txt")).toHaveCount(0)
  await expect(tree.getByText("ignored.md")).toHaveCount(0)

  await tree.getByRole("link", { name: "getting-started.md" }).click()
  await expect(page).toHaveURL(/\/view\?path=guides%2Fgetting-started\.md$/)
  await expect(page.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible()
  await expect(page.locator("main table")).toContainText("pnpm dev")
})

test("searches fixture content and opens the result", async ({ page }) => {
  await page.goto("/")

  const search = page.getByPlaceholder("Search files and content…")
  await expect(page.getByText("Select a Markdown file from the folder tree.")).toBeVisible()
  await page.locator("body").press("ControlOrMeta+k")
  await expect(search).toBeVisible()
  await search.fill("luminous-orchid")

  const result = page.getByRole("option").filter({ hasText: "search.md" })
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(/\/view\?path=reference%2Ftopics%2Fsearch\.md$/)
  await expect(page.locator("main")).toContainText("luminous-orchid")
})

test("opens search from the header control", async ({ page }) => {
  await page.goto("/")

  await page.getByRole("button", { name: /Search/ }).click()
  await expect(page.getByPlaceholder("Search files and content…")).toBeFocused()
})

test("mounts each Mermaid block in a lazy host", async ({ page }) => {
  await page.goto("/view?path=guides%2Fdiagrams.md")

  await expect(page.locator("main .mermaid-lazy")).toHaveCount(2)
})
