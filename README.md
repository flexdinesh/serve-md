# serve-md

`serve-md` starts a local web server for browsing Markdown files in a directory tree.

## Install

Go 1.24 or later is required.

```sh
go install github.com/flexdinesh/serve-md@latest
```

To install the binary from a local source checkout instead:

```sh
go install .
```

Go installs the binary into `GOBIN`, or into `$(go env GOPATH)/bin` when `GOBIN` is not configured. Ensure that directory is on your `PATH`. For zsh, add it once with:

```sh
echo 'export PATH="$(go env GOPATH)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

You can then serve Markdown from any directory:

```sh
cd /path/to/another/repository
serve-md .
```

## Local development

From the project root, download dependencies, run the tests, build the binary, and serve the current directory:

```sh
go mod download
go test ./...
go build -o ./bin/serve-md .
./bin/serve-md .
```

The browser opens automatically. To print the URL without opening a browser:

```sh
./bin/serve-md . --no-open
```

Run race detection and static analysis for a more thorough check:

```sh
go test -race ./...
go vet ./...
```

You can also run directly from source:

```sh
go run . .
go run . --help
go run . ./docs --port 8080 --depth 3
```

## Usage

```text
serve-md [path] [flags]

Flags:
      --depth int        maximum directory depth to scan (default 5)
      --port int         local port; 0 selects a free port (default 0)
      --no-open          do not open the browser automatically
      --exclude string   add an exclusion; may be repeated
```

`path` defaults to the current directory (`.`).

Examples:

```sh
serve-md
serve-md ./docs --depth 3
serve-md ./notes --port 8080 --no-open
serve-md . --exclude drafts --exclude generated
```

## Behavior

- The server listens only on the loopback interface and opens the default browser unless `--no-open` is set.
- Markdown files ending in `.md` or `.markdown` are discovered up to the configured depth.
- `.git`, `node_modules`, and `vendor` are excluded by default. Each `--exclude` adds another exclusion rather than replacing these defaults.
- Hidden directories are scanned unless they are excluded.
- Symlinks cannot be used to access content outside the served root.
- Markdown is rendered with GitHub Flavored Markdown support. Raw HTML is escaped rather than rendered.

## Limitations

- There is no automatic browser reload. Refresh the page to see file changes.
- The server is intended for local browsing, not hosting Markdown for other devices or users.
- Files below the configured scan depth are not listed.
