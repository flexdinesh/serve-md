# Development

Install dependencies:

```sh
go mod download
pnpm install
```

## Web development

Start Go and Vite in parallel:

```sh
pnpm run --parallel '/^dev:(server|web)$/'
```

This uses Go port `8080` and Vite port `5173`. Stop it before starting the comparison setup below.

## Compare feature flags

Flags are fixed when the server starts. Build once, then run one server per flag set on a unique port.

Run this block in one terminal, with `pnpm dev` stopped:

```sh
# Build the self-contained server.
pnpm build:web
go build -o ./bin/serve-md .

# Stop both background servers when this block exits.
(
  trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM

  # Default Excalidraw: http://localhost:8080
  ./bin/serve-md testdata/markdown --port 8080 --no-open &

  # tldraw: http://localhost:8081
  ./bin/serve-md testdata/markdown --port 8081 --no-open \
    --feature mermaid-tldraw &

  wait
)
```

Compare `http://localhost:8080` and `http://localhost:8081`. Press Ctrl-C to stop both. Repeat the server command with a new port for other flag sets.

`--feature` is repeatable. Unknown names fail startup.
