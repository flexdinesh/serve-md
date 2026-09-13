import { readdir, readFile } from "node:fs/promises"
import { networkInterfaces } from "node:os"
import { join } from "node:path"
import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin } from "vite"

import {
  devServerUrls,
  formatDevServerUrl,
  primaryLanIpv4,
  shouldOpenBrowser,
} from "./internal/web/dev-server.ts"

const devServerBanner: Plugin = {
  name: "servef-dev-server-banner",
  configureServer(server) {
    server.printUrls = () => {
      const address = server.httpServer?.address()

      if (address === null || address === undefined || typeof address === "string") {
        return
      }

      const lanAddress = primaryLanIpv4(networkInterfaces())
      for (const url of devServerUrls(address.port, lanAddress)) {
        server.config.logger.info(formatDevServerUrl(url))
      }
    }
  },
}

const excalidrawFontsDirectory = fileURLToPath(
  new URL(
    "./node_modules/@excalidraw/excalidraw/dist/prod/fonts",
    import.meta.url,
  ),
)

async function listFiles(directory: string, relativeDirectory = ""): Promise<string[]> {
  const entries = await readdir(join(directory, relativeDirectory), {
    withFileTypes: true,
  })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name

      if (entry.isDirectory()) {
        return listFiles(directory, relativePath)
      }
      return entry.isFile() ? [relativePath] : []
    }),
  )

  return files.flat().sort()
}

const excalidrawFonts: Plugin = {
  name: "servef-excalidraw-fonts",
  apply: "build",
  async generateBundle() {
    for (const relativePath of await listFiles(excalidrawFontsDirectory)) {
      this.emitFile({
        type: "asset",
        fileName: `excalidraw/fonts/${relativePath}`,
        source: await readFile(join(excalidrawFontsDirectory, relativePath)),
      })
    }
  },
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/assets/" : "/",
  build: {
    assetsDir: "",
    emptyOutDir: true,
    outDir: "../dist",
  },
  plugins: [react(), tailwindcss(), devServerBanner, excalidrawFonts],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./internal/web/frontend/src", import.meta.url)),
    },
  },
  root: fileURLToPath(new URL("./internal/web/frontend", import.meta.url)),
  server: {
    host: "0.0.0.0",
    open: shouldOpenBrowser(process.env),
    proxy: {
      "/assets/excalidraw":
        process.env.SERVEF_API_TARGET || "http://127.0.0.1:8080",
      "/api": process.env.SERVEF_API_TARGET || "http://127.0.0.1:8080",
    },
  },
}))
