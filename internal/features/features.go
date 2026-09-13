// Package features defines experimental server and browser behavior.
package features

import (
	"fmt"
	"strings"
)

const MermaidTldraw = "mermaid-tldraw"

// Set is an immutable collection of enabled features.
type Set struct {
	mermaidTldraw bool
}

// Data is the browser-visible feature representation.
type Data struct {
	MermaidTldraw bool `json:"mermaidTldraw"`
}

// Parse validates feature names and returns the enabled set.
func Parse(names []string) (Set, error) {
	var set Set
	for _, name := range names {
		switch name {
		case MermaidTldraw:
			set.mermaidTldraw = true
		default:
			return Set{}, fmt.Errorf("unknown feature %q; valid features: %s", name, strings.Join(Names(), ", "))
		}
	}
	return set, nil
}

// Names returns all valid feature names.
func Names() []string {
	return []string{MermaidTldraw}
}

// BrowserData returns the browser-visible feature state.
func (s Set) BrowserData() Data {
	return Data{MermaidTldraw: s.mermaidTldraw}
}
