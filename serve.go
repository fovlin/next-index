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

func serve() error {
	root, err := resolveRoot()
	if err != nil {
		return err
	}

	changed := false

	if config.Root != root {
		config.Root = root
		changed = true
	}

	if addrFlag != "" && config.Addr != addrFlag {
		config.Addr = addrFlag
		changed = true
	}

	if portFlag != "" {
		port, err := strconv.Atoi(portFlag)
		if err != nil || port <= 0 || port > 65535 {
			return fmt.Errorf("invalid port: %v", portFlag)
		}

		if config.Port != port {
			config.Port = port
			changed = true
		}
	}

	generatedPassword := ""

	if configFromLegacy {
		record.Info("migrating config from", legacyConfigPath)
		changed = true
	}

	if configCreated {
		if config.Username == "" {
			config.Username = defaultUsername
		}

		if config.Password == "" {
			password, err := randomPassword(16)
			if err != nil {
				return err
			}

			hashed, err := hashPassword(password)
			if err != nil {
				return err
			}

			config.Password = hashed
			generatedPassword = password
		}

		changed = true
	}

	if changed {
		if err := saveConfig(); err != nil {
			return err
		}
	}

	if config.TLS.Enable {
		if config.TLS.Cert == "" || config.TLS.Key == "" {
			return fmt.Errorf("tls is enabled but the certificate or key is missing from the config")
		}

		if _, err := os.Stat(config.TLS.Cert); err != nil {
			return fmt.Errorf("tls certificate: %w", err)
		}

		if _, err := os.Stat(config.TLS.Key); err != nil {
			return fmt.Errorf("tls key: %w", err)
		}
	}

	server, err := newServer(config, root)
	if err != nil {
		return err
	}

	scheme := "http"
	if config.TLS.Enable {
		scheme = "https"
	}

	listenAddress := net.JoinHostPort(config.Addr, strconv.Itoa(config.Port))

	if config.Addr == "" || config.Addr == "0.0.0.0" || config.Addr == "::" {
		listenAddress = net.JoinHostPort("localhost", strconv.Itoa(config.Port))
	}

	record.Info("next-index", version)
	record.Info("serving", root)
	record.Info("listening on", scheme+"://"+listenAddress)

	if config.writable() {
		record.Info("uploads and file management: enabled (user:", config.Username+")")
	} else {
		record.Warn("uploads and file management: disabled, run `next-index passwd` to enable them")
	}

	if generatedPassword != "" {
		record.Info("generated a password for this server")
		record.Info("username:", config.Username)
		record.Info("password:", generatedPassword)
		record.Info("stored hashed in", configPath)
		record.Info("change it with `next-index passwd`")
	}

	return server.listenAndServe()
}

func resolveRoot() (string, error) {
	var root string

	switch true {
	case len(subCmdArgs) > 0:
		root = subCmdArgs[0]
	case rootFlag != "":
		root = rootFlag
	case config.Root != "":
		root = config.Root
	default:
		root = "."
	}

	root = expandHome(root)

	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve root directory: %w", err)
	}

	realPath, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve root directory: %w", err)
	}

	info, err := os.Stat(realPath)
	if err != nil {
		return "", fmt.Errorf("stat root directory: %w", err)
	}

	if !info.IsDir() {
		return "", fmt.Errorf("root is not a directory: %v", realPath)
	}

	return realPath, nil
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
