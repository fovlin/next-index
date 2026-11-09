package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"

	"acovia.net/record"
	"golang.org/x/term"
)

const (
	configFileName = ".next_index.json"

	defaultRoot        = "./"
	defaultAddr        = "0.0.0.0"
	defaultPort        = 8080
	defaultTitle       = "NEXT_INDEX"
	defaultMaxUploadMB = 1024
	defaultUsername    = "admin"
)

type Config struct {
	Root        string `json:"root"`
	Addr        string `json:"addr"`
	Port        int    `json:"port"`
	Title       string `json:"title"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	EnableTLS   bool   `json:"enable_tls"`
	TLSCert     string `json:"tls_cert"`
	TLSKey      string `json:"tls_key"`
	MaxUploadMB int64  `json:"max_upload_mb"`
	ForceLogin  bool   `json:"force_login"`
	AllowOrigin string `json:"allow_origin"`
}

var (
	configPath string
	config     Config
)

func defaultConfig() Config {
	return Config{
		Root:        defaultRoot,
		Addr:        defaultAddr,
		Port:        defaultPort,
		Title:       defaultTitle,
		MaxUploadMB: defaultMaxUploadMB,
	}
}

func initConfigPath() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("load user directory: %w", err)
	}

	configPath = filepath.Join(homeDir, configFileName)

	return nil
}

func loadConfig() error {
	data, err := os.ReadFile(configPath)

	if os.IsNotExist(err) {
		configChanged = true
		config = defaultConfig()
	} else if err != nil {
		return fmt.Errorf("read config file: %w", err)
	} else {
		if err := json.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("parse config file %v: %w", configPath, err)
		}
	}

	config.normalize()

	return nil
}

func (config *Config) normalize() {
	if config.Root == "" {
		config.Root = defaultRoot
		configChanged = true
	}

	if config.Addr == "" {
		config.Addr = defaultAddr
		configChanged = true
	}

	if config.Port <= 0 || config.Port > 65535 {
		config.Port = defaultPort
		configChanged = true
	}

	if config.Username == "" {
		config.Username = defaultUsername
		configChanged = true
	}

	if config.Title == "" {
		config.Title = defaultTitle
		configChanged = true
	}

	if config.MaxUploadMB < 0 {
		config.MaxUploadMB = 0
		configChanged = true
	}

	if config.MaxUploadMB > 1<<20 {
		config.MaxUploadMB = 1 << 20
		configChanged = true
	}
}

func saveConfig() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}

	data = append(data, '\n')

	return writeConfigFile(data)
}

func writeConfigFile(data []byte) error {
	dir := filepath.Dir(configPath)

	temp, err := os.CreateTemp(dir, ".next_index-*.tmp")
	if err != nil {
		return fmt.Errorf("create config temp file: %w", err)
	}

	tempPath := temp.Name()

	cleanup := func() {
		temp.Close()
		os.Remove(tempPath)
	}

	if err := temp.Chmod(0600); err != nil {
		cleanup()
		return fmt.Errorf("change config permissions: %w", err)
	}

	if _, err := temp.Write(data); err != nil {
		cleanup()
		return fmt.Errorf("write config file: %w", err)
	}

	if err := temp.Close(); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("close config file: %w", err)
	}

	if err := os.Rename(tempPath, configPath); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("save config file: %w", err)
	}

	return nil
}

func (config Config) masked() Config {
	if config.Password != "" {
		config.Password = "***"
	}

	return config
}

func setConfig() error {
	if configChanged {
		if err := saveConfig(); err != nil {
			return err
		}

		return nil
	}

	data, err := json.MarshalIndent(config.masked(), "", "  ")
	if err != nil {
		return err
	}

	record.Print(string(data))
	record.Println()

	return nil
}

func unsetConfig() error {
	if len(subCmdArgs) < 1 {
		record.Error("usage: next-index unset <field>")
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read config file: %w", err)
	}

	var stored map[string]any

	if err := json.Unmarshal(data, &stored); err != nil {
		return fmt.Errorf("decode config file: %w", err)
	}

	if _, ok := stored[subCmdArgs[0]]; !ok {
		return fmt.Errorf("no such field: %v", subCmdArgs[0])
	}

	delete(stored, subCmdArgs[0])

	remaining, err := json.Marshal(stored)
	if err != nil {
		return fmt.Errorf("encode config file: %w", err)
	}

	config = defaultConfig()

	if err := json.Unmarshal(remaining, &config); err != nil {
		return fmt.Errorf("decode config file: %w", err)
	}

	return saveConfig()
}
func setPassword() error {
	password, err := readPassword("new password: ")
	if err != nil {
		return err
	}

	if password == "" {
		return fmt.Errorf("the password cannot be empty")
	}

	again, err := readPassword("repeat password: ")
	if err != nil {
		return err
	}

	if password != again {
		return fmt.Errorf("the passwords do not match")
	}

	if len(password) < 8 {
		record.Warn("this password is shorter than 8 characters")
	}

	config.Password = hashPassword(password)
	configChanged = true

	if err := saveConfig(); err != nil {
		return err
	}

	fmt.Println("password updated")

	return nil
}

func readPassword(prompt string) (string, error) {
	fd := int(os.Stdin.Fd())

	state, stateErr := term.GetState(fd)

	interrupt := make(chan os.Signal, 1)
	done := make(chan struct{})
	signal.Notify(interrupt, os.Interrupt)

	go func() {
		select {
		case <-interrupt:
			if stateErr == nil {
				_ = term.Restore(fd, state)
			}
			os.Exit(1)
		case <-done:
		}
	}()

	fmt.Fprint(os.Stderr, prompt)

	raw, err := term.ReadPassword(fd)

	fmt.Fprintln(os.Stderr)

	close(done)
	signal.Stop(interrupt)

	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}

	return string(raw), nil
}
