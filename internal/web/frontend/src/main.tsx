import { createRoot } from "react-dom/client"
import "@fontsource-variable/inter"

import { App } from "./App.tsx"
import "./style.css"

const root = document.querySelector("#root")
if (root) createRoot(root).render(<App />)
