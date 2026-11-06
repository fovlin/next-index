package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"acovia.net/record"
)

const (
	configFileName = ".next_index.json"

	defaultRoot        = "./"
	defaultAddr        = "0.0.0.0"
	defaultPort        = 8080
	defaultTitle       = "NEXT_INDEX"
	defaultMaxUploadMB = 0
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
	AllowOrigin string    `json:"allow_origin"`
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
	err = initUser()

	return err
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

func initUser() error {
	if config.Username == "" {
		if userFlag != "" {
			config.Username = userFlag
		} else {
			config.Username = defaultUsername
		}
		configChanged = true
	}

	if config.Password == "" && passwordFlag == "" {
		password, err := randomPassword(16)
		if err != nil {
			return err
		}

		config.Password = hashPassword(password)
		configChanged = true

		record.Info("generated a password for this server")
		record.Info("username:", config.Username)
		record.Info("password:", password)
		record.Info("stored hashed in", configPath)
		record.Info("change it with `next-index config -P`")
	}

	return nil
}

func saveConfig() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}

	data = append(data, '\n')

	return writeConfigFile(data)
}

// writeConfigFile replaces the config file atomically, so a crash never leaves
// a half written file behind.
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

func (config Config) writable() bool {
	return config.Username != "" && config.Password != ""
}
