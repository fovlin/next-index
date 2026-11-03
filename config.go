package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const (
	configFileName       = ".next_index.json"
	legacyConfigFileName = ".revix.json"

	defaultAddr        = "0.0.0.0"
	defaultPort        = 8080
	defaultTitle       = "NEXT_INDEX"
	defaultMaxUploadMB = 1024
	defaultUsername    = "admin"
)

type TLSConfig struct {
	Enable bool   `json:"enable"`
	Cert   string `json:"cert"`
	Key    string `json:"key"`
}

type Config struct {
	Root        string    `json:"root"`
	Addr        string    `json:"addr"`
	Port        int       `json:"port"`
	Title       string    `json:"title"`
	Username    string    `json:"username"`
	Password    string    `json:"password"`
	TLS         TLSConfig `json:"tls"`
	MaxUploadMB int64     `json:"max_upload_mb"`
}

var (
	configPath       string
	legacyConfigPath string
	configFromLegacy bool
	config           Config
)

func defaultConfig() Config {
	return Config{
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
	legacyConfigPath = filepath.Join(homeDir, legacyConfigFileName)

	return nil
}

func loadConfig() (bool, error) {
	configFromLegacy = false

	data, err := os.ReadFile(configPath)

	if os.IsNotExist(err) && legacyConfigPath != "" {
		legacyData, legacyErr := os.ReadFile(legacyConfigPath)

		switch true {
		case legacyErr == nil:
			if err := json.Unmarshal(legacyData, &config); err != nil {
				return false, fmt.Errorf("parse config file %v: %w", legacyConfigPath, err)
			}

			if config.Title == "revix" {
				config.Title = defaultTitle
			}

			config.normalize()
			configFromLegacy = true

			return false, nil

		case os.IsNotExist(legacyErr):
			config = defaultConfig()
			return true, nil

		default:
			return false, fmt.Errorf("read legacy config file: %w", legacyErr)
		}
	}

	switch true {
	case os.IsNotExist(err):
		config = defaultConfig()
		return true, nil

	case err != nil:
		return false, fmt.Errorf("read config file: %w", err)
	}

	if err := json.Unmarshal(data, &config); err != nil {
		return false, fmt.Errorf("parse config file %v: %w", configPath, err)
	}

	config.normalize()

	return false, nil
}

func (config *Config) normalize() {
	if config.Addr == "" {
		config.Addr = defaultAddr
	}

	if config.Port <= 0 || config.Port > 65535 {
		config.Port = defaultPort
	}

	if config.Title == "" {
		config.Title = defaultTitle
	}

	if config.MaxUploadMB < 0 {
		config.MaxUploadMB = 0
	}

	if config.MaxUploadMB > 1<<20 {
		config.MaxUploadMB = 1 << 20
	}
}

func saveConfig() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}

	data = append(data, '\n')

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

	configFromLegacy = false

	return nil
}

func (config Config) masked() Config {
	if config.Password != "" {
		config.Password = "***"
	}

	return config
}

func (config Config) writable() bool {
	return config.Username != "" && config.Password != ""
}
