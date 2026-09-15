# API fixtures

Committed API scenarios for frontend-only development and contract tests.

Run `pnpm dev:mock` to start Vite without the Go server. The default scenario
supports the index, one document, search, features, metrics, and missing files.

Markdown under `testdata/markdown` remains the canonical server and browser-test
corpus. These JSON files cover transport and UI states only.
