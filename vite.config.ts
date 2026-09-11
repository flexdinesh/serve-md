import { networkInterfaces } from "node:os"
import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import {
  devServerUrls,
  formatDevServerUrl,
  primaryLanIpv4,
  shouldOpenBrowser,
} from "./internal/web/dev-server.ts"

const devServerBanner: Plugin = {
  name: "serve-md-dev-server-banner",
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

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/assets/" : "/",
  build: {
    assetsDir: "",
    emptyOutDir: true,
    outDir: "../dist",
  },
  plugins: [react(), devServerBanner],
  root: fileURLToPath(new URL("./internal/web/frontend", import.meta.url)),
  server: {
    host: "0.0.0.0",
    open: shouldOpenBrowser(process.env),
    proxy: {
      "/api": process.env.SERVE_MD_API_TARGET || "http://127.0.0.1:8080",
    },
  },
}))
