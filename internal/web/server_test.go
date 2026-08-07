package web

import (
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
