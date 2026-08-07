package cmd

import (
	"bytes"
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRootCommandDefaults(t *testing.T) {
	var got options
	command := newRootCommand(func(_ context.Context, opts options, _, _ io.Writer) error {
		got = opts
		return nil
	})
	command.SetArgs(nil)
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	if got.path != "." || got.depth != 5 || got.port != 0 || got.noOpen || len(got.exclusions) != 0 {
		t.Fatalf("default options = %+v", got)
	}
}

func TestRootCommandParsesAdditiveFlags(t *testing.T) {
	var got options
	command := newRootCommand(func(_ context.Context, opts options, _, _ io.Writer) error {
		got = opts
		return nil
	})
	command.SetArgs([]string{"docs", "--depth", "3", "--port", "8080", "--no-open", "--exclude", "drafts", "--exclude", "generated"})
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	if got.path != "docs" || got.depth != 3 || got.port != 8080 || !got.noOpen {
		t.Fatalf("parsed options = %+v", got)
	}
	if strings.Join(got.exclusions, ",") != "drafts,generated" {
		t.Fatalf("exclusions = %v", got.exclusions)
	}
}

func TestRootCommandValidatesArguments(t *testing.T) {
	tests := [][]string{
		{"one", "two"},
		{"--depth", "-1"},
		{"--port", "65536"},
	}
	for _, args := range tests {
		command := newRootCommand(func(context.Context, options, io.Writer, io.Writer) error {
			t.Fatal("runner called for invalid arguments")
			return nil
		})
		command.SetArgs(args)
		if err := command.Execute(); err == nil {
			t.Fatalf("Execute(%v) error = nil", args)
		}
	}
}

func TestRunSelectsFreePortAndStopsWithContext(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# Test\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var stdout, stderr bytes.Buffer
	if err := run(ctx, options{path: root, depth: 5, port: 0, noOpen: true}, &stdout, &stderr); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stdout.String(), "http://127.0.0.1:") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestRunReportsOccupiedExplicitPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	root := t.TempDir()
	err = run(context.Background(), options{path: root, depth: 5, port: port, noOpen: true}, &bytes.Buffer{}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "listen on local port") {
		t.Fatalf("run() error = %v", err)
	}
}
