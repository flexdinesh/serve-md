# servef

Serve and browse Markdown files from a local directory.

## Features

- Render Markdown content
- Navigate files in a tree
- Render Mermaid diagrams with Excalidraw

## Install

Requires Go 1.24 or later.

```sh
go install github.com/flexdinesh/servef@latest
```

## Run

Serve the current directory:

```sh
servef .
```

Or serve another directory:

```sh
servef path/to/markdown
```

## Development

Requires Node.js 26 and pnpm 11.

```sh
go mod download
pnpm install
pnpm dev
```

Run checks:

```sh
go test ./...
pnpm test:web
pnpm typecheck
pnpm exec playwright install --with-deps chromium
pnpm test:browser
```

Build the embedded frontend:

```sh
pnpm build:web
```
