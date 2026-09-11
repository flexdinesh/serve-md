import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/assets/" : "/",
  build: {
    assetsDir: "",
    emptyOutDir: true,
    outDir: "../dist",
  },
  plugins: [react()],
  root: fileURLToPath(new URL("./internal/web/frontend", import.meta.url)),
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8080",
    },
  },
}))
