// Package cmd defines the serve-md command-line interface.
package cmd

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/flexdinesh/serve-md/internal/browser"
	"github.com/flexdinesh/serve-md/internal/features"
	"github.com/flexdinesh/serve-md/internal/files"
	webui "github.com/flexdinesh/serve-md/internal/web"
	"github.com/spf13/cobra"
)

var defaultExclusions = []string{".git", "node_modules", "vendor"}

type options struct {
	path       string
	depth      int
	port       int
	noOpen     bool
	exclusions []string
	features   features.Set
}

type runner func(context.Context, options, io.Writer, io.Writer) error

// Execute runs the root command until the server exits or receives a signal.
func Execute() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return newRootCommand(run).ExecuteContext(ctx)
}

func newRootCommand(runCommand runner) *cobra.Command {
	var opts options
	var featureNames []string
	command := &cobra.Command{
		Use:           "serve-md [path]",
		Short:         "Browse local Markdown files in a web browser",
		Args:          cobra.MaximumNArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(command *cobra.Command, args []string) error {
			opts.path = "."
			if len(args) == 1 {
				opts.path = args[0]
			}
			if opts.depth < 0 {
				return errors.New("--depth must be zero or greater")
			}
			if opts.port < 0 || opts.port > 65535 {
				return errors.New("--port must be between 0 and 65535")
			}
			parsedFeatures, err := features.Parse(featureNames)
			if err != nil {
				return err
			}
			opts.features = parsedFeatures
			return runCommand(command.Context(), opts, command.OutOrStdout(), command.ErrOrStderr())
		},
	}

	command.Flags().IntVar(&opts.depth, "depth", 5, "maximum directory depth to scan")
	command.Flags().IntVar(&opts.port, "port", 0, "local port; 0 selects a free port")
	command.Flags().BoolVar(&opts.noOpen, "no-open", false, "do not open the browser automatically")
	command.Flags().StringArrayVar(&opts.exclusions, "exclude", nil, "add a directory name to exclude (repeatable)")
	command.Flags().StringArrayVar(&featureNames, "feature", nil, "enable an experimental feature (repeatable)")
	return command
}

func run(ctx context.Context, opts options, stdout, stderr io.Writer) error {
	root, err := filepath.Abs(opts.path)
	if err != nil {
		return fmt.Errorf("resolve %q: %w", opts.path, err)
	}
	exclusions := append(append([]string{}, defaultExclusions...), opts.exclusions...)

	// Validate the root before binding a port or opening a browser.
	if _, err := files.Scan(root, opts.depth, exclusions); err != nil {
		return err
	}

	app, err := webui.New(webui.Config{Root: root, Depth: opts.depth, Exclusions: exclusions, Features: opts.features})
	if err != nil {
		return fmt.Errorf("create web interface: %w", err)
	}
	listener, err := listenTCP4(opts.port)
	if err != nil {
		return fmt.Errorf("listen on local port %d: %w", opts.port, err)
	}

	server := &http.Server{
		Handler:           app,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	serveErrors := make(chan error, 1)
	go func() {
		serveErrors <- server.Serve(listener)
	}()

	port, err := listenerPort(listener.Addr())
	if err != nil {
		_ = listener.Close()
		return err
	}
	localURL := serverURL("localhost", port)
	_, _ = fmt.Fprintf(stdout, "Serving Markdown from %s\n", root)
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		addresses = nil
	}
	writeServerURLs(stdout, port, addresses)
	if shouldOpenBrowser(opts.noOpen, os.Getenv) {
		go func() {
			if err := browser.Open(localURL); err != nil {
				_, _ = fmt.Fprintf(stderr, "Could not open browser: %v\n", err)
			}
		}()
	}

	select {
	case err := <-serveErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve Markdown: %w", err)
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("stop local server: %w", err)
		}
		return nil
	}
}

func listenTCP4(port int) (net.Listener, error) {
	return net.Listen("tcp4", net.JoinHostPort("0.0.0.0", strconv.Itoa(port)))
}

func listenerPort(address net.Addr) (int, error) {
	_, rawPort, err := net.SplitHostPort(address.String())
	if err != nil {
		return 0, fmt.Errorf("read local server address %q: %w", address.String(), err)
	}
	port, err := strconv.Atoi(rawPort)
	if err != nil {
		return 0, fmt.Errorf("read local server port %q: %w", rawPort, err)
	}
	return port, nil
}

func serverURL(host string, port int) string {
	return "http://" + net.JoinHostPort(host, strconv.Itoa(port)) + "/"
}

func writeServerURLs(output io.Writer, port int, addresses []net.Addr) {
	_, _ = fmt.Fprintf(output, "Local: %s\nHost: %s\n", serverURL("localhost", port), serverURL("0.0.0.0", port))
	if address := primaryIPv4(addresses); address != nil {
		_, _ = fmt.Fprintf(output, "Network: %s\n", serverURL(address.String(), port))
	}
}

func primaryIPv4(addresses []net.Addr) net.IP {
	for _, address := range addresses {
		var ip net.IP
		switch value := address.(type) {
		case *net.IPAddr:
			ip = value.IP
		case *net.IPNet:
			ip = value.IP
		}
		ipv4 := ip.To4()
		if ipv4 != nil && !ipv4.IsLoopback() && !ipv4.IsUnspecified() {
			return append(net.IP(nil), ipv4...)
		}
	}
	return nil
}

func shouldOpenBrowser(noOpen bool, getenv func(string) string) bool {
	if noOpen {
		return false
	}
	for _, name := range []string{"SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY"} {
		if getenv(name) != "" {
			return false
		}
	}
	return true
}
