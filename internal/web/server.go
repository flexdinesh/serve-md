// Package web serves a live Markdown index and rendered documents.
package web

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/flexdinesh/serve-md/internal/files"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

//go:embed page.html style.css search.js search-controller.js search-view.js search-worker.js vendor/minisearch.min.js vendor/MINISEARCH-LICENSE.txt
var assets embed.FS

var browserAssets = map[string]string{
	"/assets/search.js":                     "search.js",
	"/assets/search-controller.js":          "search-controller.js",
	"/assets/search-view.js":                "search-view.js",
	"/assets/search-worker.js":              "search-worker.js",
	"/assets/vendor/minisearch.min.js":      "vendor/minisearch.min.js",
	"/assets/vendor/MINISEARCH-LICENSE.txt": "vendor/MINISEARCH-LICENSE.txt",
}

// Config controls the live file scan performed for each request.
type Config struct {
	Root       string
	Depth      int
	Exclusions []string
}

// App is an HTTP handler for the Markdown browser.
type App struct {
	config   Config
	template *template.Template
	markdown goldmark.Markdown
	readFile func(string) ([]byte, error)
}

type pageData struct {
	RootName string
	Tree     []treeNode
	Selected string
	Content  template.HTML
	HasFile  bool
	Empty    bool
	Error    string
	Warnings []string
}

type treeNode struct {
	Name     string
	Path     string
	IsDir    bool
	Open     bool
	Selected bool
	Children []treeNode
}

type searchDocument struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Content string `json:"content"`
}

type searchDocumentsResponse struct {
	Documents []searchDocument `json:"documents"`
	Warnings  []string         `json:"warnings"`
}

type errorResponse struct {
	Error string `json:"error"`
}

// New constructs a request-time scanning web interface.
func New(config Config) (*App, error) {
	page, err := fs.ReadFile(assets, "page.html")
	if err != nil {
		return nil, err
	}
	style, err := fs.ReadFile(assets, "style.css")
	if err != nil {
		return nil, err
	}
	tmpl, err := template.New("page.html").Parse(strings.Replace(string(page), "/* STYLE */", string(style), 1))
	if err != nil {
		return nil, err
	}

	md := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithRendererOptions(renderer.WithNodeRenderers(util.Prioritized(&escapedHTMLRenderer{}, 500))),
	)
	return &App{config: config, template: tmpl, markdown: md, readFile: os.ReadFile}, nil
}

// ServeHTTP rescans the configured directory before rendering every response.
func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline'; script-src 'self'; worker-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if asset, ok := browserAssets[r.URL.Path]; ok {
		a.serveAsset(w, asset)
		return
	}
	if r.URL.Path == "/api/search-documents" {
		a.serveSearchDocuments(w)
		return
	}
	if r.URL.Path != "/" && r.URL.Path != "/view" {
		http.NotFound(w, r)
		return
	}

	selected := ""
	if r.URL.Path == "/view" {
		selected = r.URL.Query().Get("path")
		if selected == "" {
			a.renderError(w, http.StatusBadRequest, "No Markdown file was selected.", selected)
			return
		}
	}
	a.renderPage(w, selected)
}

func (a *App) serveAsset(w http.ResponseWriter, name string) {
	content, err := fs.ReadFile(assets, name)
	if err != nil {
		http.NotFound(w, nil)
		return
	}
	if strings.HasSuffix(name, ".js") {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	} else {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	}
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(content)
}

func (a *App) serveSearchDocuments(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")

	index, err := files.Scan(a.config.Root, a.config.Depth, a.config.Exclusions)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: err.Error()})
		return
	}

	response := searchDocumentsResponse{
		Documents: make([]searchDocument, 0, len(index.Files)),
		Warnings:  warningStrings(index.Warnings),
	}
	for _, indexedPath := range index.Files {
		resolved, err := index.Resolve(indexedPath)
		if err != nil {
			response.Warnings = append(response.Warnings, fmt.Sprintf("%s: %v", indexedPath, err))
			continue
		}
		source, err := a.readFile(resolved)
		if err != nil {
			response.Warnings = append(response.Warnings, fmt.Sprintf("%s: %v", indexedPath, err))
			continue
		}
		content, err := a.searchText(source)
		if err != nil {
			response.Warnings = append(response.Warnings, fmt.Sprintf("%s: %v", indexedPath, err))
			continue
		}
		response.Documents = append(response.Documents, searchDocument{
			Path:    indexedPath,
			Name:    path.Base(indexedPath),
			Content: content,
		})
	}
	writeJSON(w, http.StatusOK, response)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (a *App) searchText(source []byte) (string, error) {
	document := a.markdown.Parser().Parse(text.NewReader(source))
	parts := make([]string, 0)
	err := ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch value := node.(type) {
		case *ast.Text:
			parts = append(parts, string(value.Value(source)))
		case *ast.String:
			parts = append(parts, string(value.Value))
		case *ast.AutoLink:
			parts = append(parts, string(value.Text(source)))
		case *ast.CodeBlock:
			parts = append(parts, string(value.Lines().Value(source)))
			return ast.WalkSkipChildren, nil
		case *ast.FencedCodeBlock:
			parts = append(parts, string(value.Lines().Value(source)))
			return ast.WalkSkipChildren, nil
		case *ast.RawHTML:
			parts = append(parts, string(value.Text(source)))
			return ast.WalkSkipChildren, nil
		case *ast.HTMLBlock:
			parts = append(parts, string(value.Text(source)))
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	if err != nil {
		return "", err
	}
	return strings.Join(strings.Fields(strings.Join(parts, " ")), " "), nil
}

func (a *App) renderPage(w http.ResponseWriter, selected string) {
	index, err := files.Scan(a.config.Root, a.config.Depth, a.config.Exclusions)
	if err != nil {
		a.execute(w, http.StatusInternalServerError, pageData{RootName: filepath.Base(a.config.Root), Error: err.Error()})
		return
	}
	data := pageData{
		RootName: filepath.Base(index.RootPath()),
		Selected: selected,
		Empty:    len(index.Files) == 0,
		Warnings: warningStrings(index.Warnings),
	}
	data.Tree = makeTree(index.Tree.Children, selected)

	if selected != "" {
		resolved, err := index.Resolve(selected)
		if err != nil {
			status := http.StatusNotFound
			if errors.Is(err, files.ErrPathEscape) {
				status = http.StatusBadRequest
			}
			data.Error = "That Markdown file is unavailable. Refresh the index and choose another file."
			a.execute(w, status, data)
			return
		}
		source, err := a.readFile(resolved)
		if err != nil {
			data.Error = fmt.Sprintf("Could not read %s: %v", selected, err)
			a.execute(w, http.StatusInternalServerError, data)
			return
		}
		var rendered bytes.Buffer
		if err := a.renderMarkdown(source, selected, &rendered); err != nil {
			data.Error = fmt.Sprintf("Could not render %s: %v", selected, err)
			a.execute(w, http.StatusInternalServerError, data)
			return
		}
		data.Content = template.HTML(rendered.String()) // Goldmark escapes raw HTML via escapedHTMLRenderer.
		data.HasFile = true
	}
	a.execute(w, http.StatusOK, data)
}

func (a *App) renderMarkdown(source []byte, selected string, output *bytes.Buffer) error {
	document := a.markdown.Parser().Parse(text.NewReader(source))
	err := ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering && node.Kind() == ast.KindLink {
			link := node.(*ast.Link)
			link.Destination = rewriteMarkdownLink(link.Destination, selected)
		}
		return ast.WalkContinue, nil
	})
	if err != nil {
		return err
	}
	return a.markdown.Renderer().Render(output, source, document)
}

func rewriteMarkdownLink(destination []byte, selected string) []byte {
	target, err := url.Parse(string(destination))
	if err != nil || target.Scheme != "" || target.Host != "" || target.Path == "" {
		return destination
	}
	extension := strings.ToLower(path.Ext(target.Path))
	if extension != ".md" && extension != ".markdown" {
		return destination
	}

	markdownPath := target.Path
	if strings.HasPrefix(markdownPath, "/") {
		markdownPath = strings.TrimPrefix(markdownPath, "/")
	} else {
		markdownPath = path.Join(path.Dir(selected), markdownPath)
	}
	markdownPath = path.Clean(markdownPath)

	query := target.Query()
	query.Set("path", markdownPath)
	return []byte((&url.URL{
		Path:     "/view",
		RawQuery: query.Encode(),
		Fragment: target.Fragment,
	}).String())
}

func (a *App) renderError(w http.ResponseWriter, status int, message, selected string) {
	index, err := files.Scan(a.config.Root, a.config.Depth, a.config.Exclusions)
	data := pageData{RootName: filepath.Base(a.config.Root), Selected: selected, Error: message}
	if err == nil {
		data.RootName = filepath.Base(index.RootPath())
		data.Tree = makeTree(index.Tree.Children, selected)
		data.Empty = len(index.Files) == 0
		data.Warnings = warningStrings(index.Warnings)
	}
	a.execute(w, status, data)
}

func (a *App) execute(w http.ResponseWriter, status int, data pageData) {
	var output bytes.Buffer
	if err := a.template.Execute(&output, data); err != nil {
		http.Error(w, "could not render page", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(output.Bytes())
}

func makeTree(entries []files.Entry, selected string) []treeNode {
	nodes := make([]treeNode, 0, len(entries))
	for _, entry := range entries {
		node := treeNode{Name: entry.Name, Path: entry.Path, IsDir: entry.IsDir, Selected: entry.Path == selected}
		node.Children = makeTree(entry.Children, selected)
		node.Open = entry.IsDir && (selected == entry.Path || strings.HasPrefix(selected, entry.Path+"/"))
		nodes = append(nodes, node)
	}
	return nodes
}

func warningStrings(warnings []files.Warning) []string {
	result := make([]string, len(warnings))
	for i, warning := range warnings {
		result[i] = warning.Error()
	}
	return result
}

type escapedHTMLRenderer struct{}

func (*escapedHTMLRenderer) RegisterFuncs(register renderer.NodeRendererFuncRegisterer) {
	register.Register(ast.KindHTMLBlock, renderEscapedHTMLBlock)
	register.Register(ast.KindRawHTML, renderEscapedRawHTML)
}

func renderEscapedHTMLBlock(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	block := node.(*ast.HTMLBlock)
	if entering {
		for i := 0; i < block.Lines().Len(); i++ {
			line := block.Lines().At(i)
			_, _ = w.Write(util.EscapeHTML(line.Value(source)))
		}
	} else if block.HasClosure() {
		_, _ = w.Write(util.EscapeHTML(block.ClosureLine.Value(source)))
	}
	return ast.WalkContinue, nil
}

func renderEscapedRawHTML(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkSkipChildren, nil
	}
	raw := node.(*ast.RawHTML)
	for i := 0; i < raw.Segments.Len(); i++ {
		segment := raw.Segments.At(i)
		_, _ = w.Write(util.EscapeHTML(segment.Value(source)))
	}
	return ast.WalkSkipChildren, nil
}
