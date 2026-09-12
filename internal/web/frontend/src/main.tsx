import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import "@fontsource-variable/inter"

import { ThemeProvider } from "./components/ThemeProvider.tsx"
import { router } from "./router.tsx"
import { initializeTheme } from "./theme.ts"
import "./style.css"

const initialTheme = initializeTheme()
const root = document.querySelector("#root")
if (root) {
  createRoot(root).render(
    <ThemeProvider initialTheme={initialTheme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}
