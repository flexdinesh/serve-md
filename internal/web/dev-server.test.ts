import assert from "node:assert/strict"
import test from "node:test"

import {
  devServerUrls,
  formatDevServerUrl,
  primaryLanIpv4,
  shouldOpenBrowser,
} from "./dev-server.ts"

test("primaryLanIpv4 returns only the first external IPv4 address", () => {
  assert.equal(
    primaryLanIpv4({
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      wifi: [
        { address: "fe80::1", family: "IPv6", internal: false },
        { address: "192.168.1.25", family: "IPv4", internal: false },
      ],
      vpn: [{ address: "10.0.0.2", family: "IPv4", internal: false }],
    }),
    "192.168.1.25",
  )
})

test("primaryLanIpv4 returns undefined without an external IPv4 address", () => {
  assert.equal(
    primaryLanIpv4({
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      wifi: [{ address: "fe80::1", family: "IPv6", internal: false }],
    }),
    undefined,
  )
})

test("devServerUrls uses the selected port and at most one LAN address", () => {
  assert.deepEqual(devServerUrls(5174, "192.168.1.25"), [
    { label: "Local", url: "http://localhost:5174/" },
    { label: "Host", url: "http://0.0.0.0:5174/" },
    { label: "Network", url: "http://192.168.1.25:5174/" },
  ])
  assert.deepEqual(devServerUrls(5174, undefined), [
    { label: "Local", url: "http://localhost:5174/" },
    { label: "Host", url: "http://0.0.0.0:5174/" },
  ])
})

test("formatDevServerUrl aligns startup labels", () => {
  assert.equal(
    formatDevServerUrl({ label: "Local", url: "http://localhost:5173/" }),
    "  ➜  Local:   http://localhost:5173/",
  )
  assert.equal(
    formatDevServerUrl({ label: "Network", url: "http://192.168.1.25:5173/" }),
    "  ➜  Network: http://192.168.1.25:5173/",
  )
})

test("shouldOpenBrowser permits only the direct dev:vite lifecycle outside SSH", () => {
  assert.equal(shouldOpenBrowser({ npm_lifecycle_event: "dev:vite" }), true)
  assert.equal(
    shouldOpenBrowser({ npm_lifecycle_event: "dev:vite", SSH_TTY: "" }),
    true,
  )
  assert.equal(shouldOpenBrowser({ npm_lifecycle_event: "test:browser" }), false)
  assert.equal(shouldOpenBrowser({}), false)

  for (const sshVariable of ["SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY"]) {
    assert.equal(
      shouldOpenBrowser({
        npm_lifecycle_event: "dev:vite",
        [sshVariable]: "active",
      }),
      false,
    )
  }
})
