package features

import (
	"strings"
	"testing"
)

func TestParseDefaultsDisabled(t *testing.T) {
	set, err := Parse(nil)
	if err != nil {
		t.Fatal(err)
	}
	if set.BrowserData().MermaidTldraw {
		t.Fatal("mermaid-tldraw enabled by default")
	}
}

func TestParseEnablesKnownFeatureAndIgnoresDuplicates(t *testing.T) {
	set, err := Parse([]string{MermaidTldraw, MermaidTldraw})
	if err != nil {
		t.Fatal(err)
	}
	if !set.BrowserData().MermaidTldraw {
		t.Fatal("mermaid-tldraw not enabled")
	}
}

func TestParseRejectsUnknownFeature(t *testing.T) {
	_, err := Parse([]string{"unknown"})
	if err == nil || !strings.Contains(err.Error(), `unknown feature "unknown"`) || !strings.Contains(err.Error(), MermaidTldraw) {
		t.Fatalf("Parse() error = %v", err)
	}
}
