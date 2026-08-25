# serve-md

`serve-md` starts a local web server for browsing Markdown files in a directory tree.

## Install

Go 1.24 or later is required.

```sh
go install github.com/flexdinesh/serve-md@latest
```

Serve the current directory:

```sh
serve-md .
```

Press <kbd>Command</kbd>+<kbd>K</kbd> on macOS or <kbd>Ctrl</kbd>+<kbd>K</kbd> elsewhere to search Markdown file paths and contents in the browser.

## Development

Install dependencies:

```sh
go mod download
```

Run the Go and browser search tests:

```sh
go test ./...
node --test internal/web/*.test.mjs
```

Build and run locally:

```sh
go build -o ./bin/serve-md .
./bin/serve-md .
```

Install the local binary to your Go binary directory:

```sh
go install .
```

## License

MIT
