import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import "@fontsource-variable/inter"

import { router } from "./router.tsx"
import "./style.css"

const root = document.querySelector("#root")
if (root) createRoot(root).render(<RouterProvider router={router} />)
