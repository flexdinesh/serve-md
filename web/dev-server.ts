export interface NetworkAddress {
  address: string
  family: string
  internal: boolean
}

export type NetworkInterfaces = Readonly<
  Record<string, readonly NetworkAddress[] | undefined>
>

export type Environment = Readonly<Record<string, string | undefined>>

export interface DevServerUrl {
  label: "Local" | "Host" | "Network"
  url: string
}

export interface MockFixture {
  name: string
  status: number
}

export function primaryLanIpv4(
  interfaces: NetworkInterfaces,
): string | undefined {
  for (const addresses of Object.values(interfaces)) {
    for (const candidate of addresses ?? []) {
      if (candidate.family === "IPv4" && !candidate.internal) {
        return candidate.address
      }
    }
  }

  return undefined
}

export function devServerUrls(
  port: number,
  lanAddress: string | undefined,
): readonly DevServerUrl[] {
  const urls: DevServerUrl[] = [
    { label: "Local", url: `http://localhost:${port}/` },
    { label: "Host", url: `http://0.0.0.0:${port}/` },
  ]

  if (lanAddress !== undefined) {
    urls.push({ label: "Network", url: `http://${lanAddress}:${port}/` })
  }

  return urls
}

export function formatDevServerUrl({ label, url }: DevServerUrl): string {
  return `  ➜  ${label}:${" ".repeat(8 - label.length)}${url}`
}

export function isSshSession(environment: Environment): boolean {
  return ["SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY"].some(
    (name) => Boolean(environment[name]),
  )
}

export function shouldOpenBrowser(environment: Environment): boolean {
  return ["dev", "dev:mock"].includes(environment.npm_lifecycle_event ?? "")
    && !isSshSession(environment)
}

export function mockFixtureName(method: string, rawURL: string): MockFixture | undefined {
  if (method !== "GET") return undefined
  const url = new URL(rawURL, "http://localhost")
  switch (url.pathname) {
    case "/features":
      return { name: "features.json", status: 200 }
    case "/metrics":
      return { name: "metrics.json", status: 200 }
    case "/search-documents":
      return { name: "search-documents.json", status: 200 }
    case "/page":
      if (!url.searchParams.has("path")) return { name: "page-index.json", status: 200 }
      return url.searchParams.get("path") === "guides/getting-started.md"
        ? { name: "page-document.json", status: 200 }
        : { name: "page-missing.json", status: 404 }
    default:
      return undefined
  }
}
