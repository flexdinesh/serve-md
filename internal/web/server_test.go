package web

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppListsAndRendersMarkdown(t *testing.T) {
	root := t.TempDir()
	writeMarkdown(t, filepath.Join(root, "docs", "Guide.MD"), "# Guide\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert('no')</script>\n")
	if err := os.Mkdir(filepath.Join(root, "empty"), 0o755); err != nil {
		t.Fatal(err)
	}

	app := newTestApp(t, root)
	landing := request(t, app, "/")
	if landing.Code != http.StatusOK {
		t.Fatalf("landing status = %d, want %d", landing.Code, http.StatusOK)
	}
	assertContains(t, landing.Body.String(), "<summary>docs/</summary>", "Guide.MD", "Select a Markdown file")
	if strings.Contains(landing.Body.String(), ">empty<") {
		t.Fatal("landing includes a directory with no Markdown descendants")
	}

	document := request(t, app, "/view?path=docs%2FGuide.MD")
	if document.Code != http.StatusOK {
		t.Fatalf("document status = %d, want %d", document.Code, http.StatusOK)
	}
	body := document.Body.String()
	assertContains(t, body, "<h1>Guide</h1>", "<table>", "&lt;script&gt;alert('no')&lt;/script&gt;")
	if strings.Contains(body, "<script>alert") {
		t.Fatal("raw Markdown HTML was rendered unsafely")
	}
	if got := document.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := document.Header().Get("Content-Security-Policy"); got == "" {
		t.Fatal("Content-Security-Policy is empty")
	}
	assertContains(t, landing.Body.String(), `id="search-dialog"`, `id="search-input"`, `src="/assets/search.js"`)
}

func TestSearchDocumentsReturnsPathsNamesAndVisibleText(t *testing.T) {
	root := t.TempDir()
	writeMarkdown(t, filepath.Join(root, "docs", "Guide.md"), strings.Join([]string{
		"# Install Guide",
		"Read the **setup instructions** and [reference](https://example.com).",
		"Use `serve-md`.",
		"```sh",
		"serve-md docs",
		"```",
		"<script>hiddenMarkup()</script>",
	}, "\n\n"))
	writeMarkdown(t, filepath.Join(root, "node_modules", "ignored.md"), "# Ignored")

	response := request(t, newTestApp(t, root), "/api/search-documents")
	if response.Code != http.StatusOK {
		t.Fatalf("search status = %d, want %d", response.Code, http.StatusOK)
	}
	if got := response.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}

	var payload searchDocumentsResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Documents) != 1 {
		t.Fatalf("documents = %#v, want one", payload.Documents)
	}
	document := payload.Documents[0]
	if document.Path != "docs/Guide.md" || document.Name != "Guide.md" {
		t.Fatalf("document identity = %#v", document)
	}
	assertContains(t, document.Content, "Install Guide", "setup instructions", "reference", "serve-md", "serve-md docs", "hiddenMarkup")
	for _, unwanted := range []string{"https://example.com", "**", "```", root} {
		if strings.Contains(document.Content, unwanted) {
			t.Errorf("search content contains %q: %s", unwanted, document.Content)
		}
	}
}

func TestSearchDocumentsRescansAndReportsUnreadableFiles(t *testing.T) {
	root := t.TempDir()
	writeMarkdown(t, filepath.Join(root, "first.md"), "# First")
	app := newTestApp(t, root)

	first := request(t, app, "/api/search-documents")
	assertContains(t, first.Body.String(), "first.md")
	writeMarkdown(t, filepath.Join(root, "second.md"), "# Second")
	second := request(t, app, "/api/search-documents")
	assertContains(t, second.Body.String(), "first.md", "second.md")

	originalReadFile := app.readFile
	app.readFile = func(name string) ([]byte, error) {
		if filepath.Base(name) == "second.md" {
			return nil, errors.New("test read failure")
		}
		return originalReadFile(name)
	}
	partial := request(t, app, "/api/search-documents")
	if partial.Code != http.StatusOK {
		t.Fatalf("partial status = %d, want %d", partial.Code, http.StatusOK)
	}
	var payload searchDocumentsResponse
	if err := json.Unmarshal(partial.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Documents) != 1 || payload.Documents[0].Path != "first.md" {
		t.Fatalf("partial documents = %#v", payload.Documents)
	}
	if len(payload.Warnings) != 1 || !strings.Contains(payload.Warnings[0], "second.md: test read failure") {
		t.Fatalf("warnings = %#v", payload.Warnings)
	}
}

func TestSearchDocumentsEncodesHostileMarkdownAsJSON(t *testing.T) {
	root := t.TempDir()
	writeMarkdown(t, filepath.Join(root, "hostile.md"), "# Safe\n\nText </script><script>alert(1)</script> tail")
	response := request(t, newTestApp(t, root), "/api/search-documents")
	if strings.Contains(response.Body.String(), "</script>") {
		t.Fatalf("JSON response contains an unescaped script terminator: %s", response.Body.String())
	}
	var payload searchDocumentsResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Documents) != 1 {
		t.Fatalf("documents = %#v", payload.Documents)
	}
}

func TestSearchDocumentsReturnsJSONForFatalScan(t *testing.T) {
	root := t.TempDir()
	app := newTestApp(t, root)
	if err := os.Remove(root); err != nil {
		t.Fatal(err)
	}
	response := request(t, app, "/api/search-documents")
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("search status = %d, want %d", response.Code, http.StatusInternalServerError)
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Error == "" {
		t.Fatal("JSON error is empty")
	}
}

func TestBrowserAssetsAndSearchCSP(t *testing.T) {
	app := newTestApp(t, t.TempDir())
	for _, target := range []string{
		"/assets/search.js",
		"/assets/search-controller.js",
		"/assets/search-view.js",
		"/assets/search-worker.js",
		"/assets/vendor/minisearch.min.js",
	} {
		response := request(t, app, target)
		if response.Code != http.StatusOK {
			t.Errorf("GET %s status = %d, want %d", target, response.Code, http.StatusOK)
		}
		if got := response.Header().Get("Content-Type"); got != "text/javascript; charset=utf-8" {
			t.Errorf("GET %s Content-Type = %q", target, got)
		}
	}
	response := request(t, app, "/")
	csp := response.Header().Get("Content-Security-Policy")
	assertContains(t, csp, "script-src 'self'", "worker-src 'self'", "connect-src 'self'")
}

func TestAppRescansOnEveryRequest(t *testing.T) {
	root := t.TempDir()
	writeMarkdown(t, filepath.Join(root, "first.md"), "# First\n")
	app := newTestApp(t, root)

	first := request(t, app, "/")
	if strings.Contains(first.Body.String(), "second.md") {
		t.Fatal("second.md appeared before it existed")
	}
	writeMarkdown(t, filepath.Join(root, "second.md"), "# Second\n")
	second := request(t, app, "/")
	assertContains(t, second.Body.String(), "first.md", "second.md")
}

func TestAppRewritesLocalMarkdownLinksToViewRoutes(t *testing.T) {
	root := t.TempDir()
	writeMarkdown(t, filepath.Join(root, "README.md"), "# Home\n")
	writeMarkdown(t, filepath.Join(root, "docs", "Guide.MD"), strings.Join([]string{
		"[root](../README.md#top)",
		"[sibling](Other.markdown?plain=1#details)",
		"[root relative](/README.md)",
		"[external](https://example.com/README.md)",
		"[anchor](#section)",
		"[other file](notes.txt)",
	}, "\n\n"))
	writeMarkdown(t, filepath.Join(root, "docs", "Other.markdown"), "# Other\n")

	document := request(t, newTestApp(t, root), "/view?path=docs%2FGuide.MD")
	if document.Code != http.StatusOK {
		t.Fatalf("document status = %d, want %d", document.Code, http.StatusOK)
	}
	body := document.Body.String()
	assertContains(t, body,
		`href="/view?path=README.md#top"`,
		`href="/view?path=docs%2FOther.markdown&amp;plain=1#details"`,
		`href="/view?path=README.md"`,
		`href="https://example.com/README.md"`,
		`href="#section"`,
		`href="notes.txt"`,
	)
}

func TestAppHandlesEmptyMissingAndUnsafeSelections(t *testing.T) {
	root := t.TempDir()
	app := newTestApp(t, root)

	empty := request(t, app, "/")
	assertContains(t, empty.Body.String(), "No Markdown files found")

	missing := request(t, app, "/view?path=missing.md")
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing status = %d, want %d", missing.Code, http.StatusNotFound)
	}
	assertContains(t, missing.Body.String(), "unavailable")

	unsafe := request(t, app, "/view?path=..%2Foutside.md")
	if unsafe.Code != http.StatusBadRequest {
		t.Fatalf("unsafe status = %d, want %d", unsafe.Code, http.StatusBadRequest)
	}

	noSelection := request(t, app, "/view")
	if noSelection.Code != http.StatusBadRequest {
		t.Fatalf("empty selection status = %d, want %d", noSelection.Code, http.StatusBadRequest)
	}
}

func TestAppRejectsUnknownRoutesAndMethods(t *testing.T) {
	app := newTestApp(t, t.TempDir())
	unknown := request(t, app, "/unknown")
	if unknown.Code != http.StatusNotFound {
		t.Fatalf("unknown status = %d, want %d", unknown.Code, http.StatusNotFound)
	}

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	response := httptest.NewRecorder()
	app.ServeHTTP(response, req)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/search-documents", nil)
	response = httptest.NewRecorder()
	app.ServeHTTP(response, req)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST search status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
}

func newTestApp(t *testing.T, root string) *App {
	t.Helper()
	app, err := New(Config{Root: root, Depth: 5, Exclusions: []string{".git", "node_modules", "vendor"}})
	if err != nil {
		t.Fatal(err)
	}
	return app
}

func request(t *testing.T, handler http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func writeMarkdown(t *testing.T, name, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func assertContains(t *testing.T, value string, substrings ...string) {
	t.Helper()
	for _, substring := range substrings {
		if !strings.Contains(value, substring) {
			t.Errorf("response does not contain %q\n%s", substring, value)
		}
	}
}
