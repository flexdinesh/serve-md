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
			return runCommand(command.Context(), opts, command.OutOrStdout(), command.ErrOrStderr())
		},
	}

	command.Flags().IntVar(&opts.depth, "depth", 5, "maximum directory depth to scan")
	command.Flags().IntVar(&opts.port, "port", 0, "local port; 0 selects a free port")
	command.Flags().BoolVar(&opts.noOpen, "no-open", false, "do not open the browser automatically")
	command.Flags().StringArrayVar(&opts.exclusions, "exclude", nil, "add a directory name to exclude (repeatable)")
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

	app, err := webui.New(webui.Config{Root: root, Depth: opts.depth, Exclusions: exclusions})
	if err != nil {
		return fmt.Errorf("create web interface: %w", err)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(opts.port)))
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

	url := "http://" + listener.Addr().String() + "/"
	_, _ = fmt.Fprintf(stdout, "Serving Markdown from %s\n%s\n", root, url)
	if !opts.noOpen {
		go func() {
			if err := browser.Open(url); err != nil {
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
