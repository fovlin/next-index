package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"acovia.net/record"
)

func run() error {
	root, err := filepath.Abs(config.Root)
	if err != nil {
		return err
	}

	info, err := os.Stat(root)
	if err != nil {
		return err
	}

	if !info.IsDir() {
		return fmt.Errorf("root is not a directory: %v", root)
	}

	if config.EnableTLS {
		if config.TLSCert == "" || config.TLSKey == "" {
			return fmt.Errorf("tls is enabled but the certificate or key is missing from the config")
		}

		if _, err := os.Stat(config.TLSCert); err != nil {
			return fmt.Errorf("tls certificate: %w", err)
		}

		if _, err := os.Stat(config.TLSKey); err != nil {
			return fmt.Errorf("tls key: %w", err)
		}
	}

	if config.Password == "" {
		return fmt.Errorf("no password is set: run `next-index passwd` to choose one")
	}

	server, err = newServer(config, root)
	if err != nil {
		return err
	}

	scheme := "http"
	if config.EnableTLS {
		scheme = "https"
	}

	listenAddress := net.JoinHostPort(config.Addr, strconv.Itoa(config.Port))

	if config.Addr == "" || config.Addr == "0.0.0.0" || config.Addr == "::" {
		listenAddress = net.JoinHostPort("localhost", strconv.Itoa(config.Port))
	}

	record.Info("next-index:", version)
	record.Info("serving:", root)
	record.Info("username:", config.Username)
	record.Info("listening on:", scheme+"://"+listenAddress)

	if !validPasswordHash(config.Password) {
		record.Warn("the stored password hash is not a SHA-256 digest, run `next-index passwd` to set a new password")
	}

	return server.run()
}

func expandHome(value string) string {
	if value != "~" && !strings.HasPrefix(value, "~/") {
		return value
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return value
	}

	return filepath.Join(homeDir, strings.TrimPrefix(value, "~"))
}
