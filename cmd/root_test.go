package cmd

import (
	"bytes"
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/flexdinesh/servef/internal/features"
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
	if got.path != "." || got.depth != 5 || got.port != 0 || got.noOpen || len(got.exclusions) != 0 || got.features.BrowserData().MermaidTldraw {
		t.Fatalf("default options = %+v", got)
	}
}

func TestRootCommandHelpUsesServef(t *testing.T) {
	var output bytes.Buffer
	command := newRootCommand(func(context.Context, options, io.Writer, io.Writer) error {
		t.Fatal("runner called for help")
		return nil
	})
	command.SetOut(&output)
	command.SetArgs([]string{"--help"})
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	if got := output.String(); !strings.Contains(got, "Usage:\n  servef [path] [flags]") {
		t.Fatalf("help output = %q", got)
	}
}

func TestRootCommandParsesAdditiveFlags(t *testing.T) {
	var got options
	command := newRootCommand(func(_ context.Context, opts options, _, _ io.Writer) error {
		got = opts
		return nil
	})
	command.SetArgs([]string{"docs", "--depth", "3", "--port", "8080", "--no-open", "--exclude", "drafts", "--exclude", "generated", "--feature", features.MermaidTldraw, "--feature", features.MermaidTldraw})
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	if got.path != "docs" || got.depth != 3 || got.port != 8080 || !got.noOpen {
		t.Fatalf("parsed options = %+v", got)
	}
	if strings.Join(got.exclusions, ",") != "drafts,generated" {
		t.Fatalf("exclusions = %v", got.exclusions)
	}
	if !got.features.BrowserData().MermaidTldraw {
		t.Fatal("mermaid-tldraw feature not enabled")
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

func TestRootCommandRejectsUnknownFeatureBeforeRun(t *testing.T) {
	command := newRootCommand(func(context.Context, options, io.Writer, io.Writer) error {
		t.Fatal("runner called for unknown feature")
		return nil
	})
	command.SetArgs([]string{"--feature", "unknown"})
	err := command.Execute()
	if err == nil || !strings.Contains(err.Error(), `unknown feature "unknown"`) || !strings.Contains(err.Error(), features.MermaidTldraw) {
		t.Fatalf("Execute() error = %v", err)
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
	localPort := ""
	for _, line := range strings.Split(stdout.String(), "\n") {
		if strings.HasPrefix(line, "Local: http://localhost:") {
			localPort = strings.TrimSuffix(strings.TrimPrefix(line, "Local: http://localhost:"), "/")
		}
	}
	if _, err := strconv.Atoi(localPort); err != nil {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "Host: http://0.0.0.0:"+localPort+"/\n") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestListenTCP4BindsIPv4Wildcard(t *testing.T) {
	listener, err := listenTCP4(0)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener address type = %T", listener.Addr())
	}
	if address.IP.To4() == nil || !address.IP.IsUnspecified() {
		t.Fatalf("listener address = %s, want IPv4 wildcard", address)
	}
}

func TestWriteServerURLsIncludesAllReachableAddresses(t *testing.T) {
	var output bytes.Buffer
	writeServerURLs(&output, 4173, []net.Addr{
		ipNetwork(t, "127.0.0.1/8"),
		ipNetwork(t, "2001:db8::1/64"),
		ipNetwork(t, "192.168.1.42/24"),
		ipNetwork(t, "10.0.0.12/8"),
	})

	want := "Local: http://localhost:4173/\n" +
		"Host: http://0.0.0.0:4173/\n" +
		"Network: http://192.168.1.42:4173/\n"
	if output.String() != want {
		t.Fatalf("output = %q, want %q", output.String(), want)
	}
}

func TestWriteServerURLsOmitsUnavailableNetworkAddress(t *testing.T) {
	var output bytes.Buffer
	writeServerURLs(&output, 4173, []net.Addr{
		ipNetwork(t, "127.0.0.1/8"),
		ipNetwork(t, "2001:db8::1/64"),
	})

	want := "Local: http://localhost:4173/\nHost: http://0.0.0.0:4173/\n"
	if output.String() != want {
		t.Fatalf("output = %q, want %q", output.String(), want)
	}
}

func TestPrimaryIPv4SelectsFirstUsableAddress(t *testing.T) {
	addresses := []net.Addr{
		ipNetwork(t, "127.0.0.1/8"),
		ipNetwork(t, "2001:db8::1/64"),
		ipNetwork(t, "192.168.1.42/24"),
		ipNetwork(t, "10.0.0.12/8"),
	}

	if got := primaryIPv4(addresses); got == nil || got.String() != "192.168.1.42" {
		t.Fatalf("primaryIPv4() = %v, want 192.168.1.42", got)
	}
}

func TestShouldOpenBrowser(t *testing.T) {
	tests := []struct {
		name   string
		noOpen bool
		env    map[string]string
		want   bool
	}{
		{name: "local session", want: true},
		{name: "no-open flag", noOpen: true, want: false},
		{name: "SSH connection", env: map[string]string{"SSH_CONNECTION": "client server"}, want: false},
		{name: "SSH client", env: map[string]string{"SSH_CLIENT": "client"}, want: false},
		{name: "SSH TTY", env: map[string]string{"SSH_TTY": "/dev/pts/1"}, want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			getenv := func(name string) string { return test.env[name] }
			if got := shouldOpenBrowser(test.noOpen, getenv); got != test.want {
				t.Fatalf("shouldOpenBrowser() = %t, want %t", got, test.want)
			}
		})
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

func ipNetwork(t *testing.T, value string) net.Addr {
	t.Helper()
	ip, network, err := net.ParseCIDR(value)
	if err != nil {
		t.Fatal(err)
	}
	network.IP = ip
	return network
}
