# 0001: Polyglot single-product repository

Status: accepted

## Decision

Keep one Go module, one pnpm frontend workspace, and one release artifact.
Frontend source lives in `web`; generated assets live beside the Go embed owner
in `internal/web/dist`. Keep `main.go` at repository root.

## Reasons

- Go packages already provide sufficient internal boundaries.
- Go and frontend code change and release together.
- Root `main.go` preserves `go install github.com/flexdinesh/servef@latest`.
- Committed assets let that installation path compile without Node.js.
- A real frontend workspace separates dependency ownership without introducing
  unused packages or a second release lifecycle.

## Consequences

- Production frontend changes include generated `internal/web/dist` changes.
- CI must verify generated output is current.
- `go.work`, task-graph tooling, and extra frontend packages remain unnecessary
  until independently consumed projects appear.
