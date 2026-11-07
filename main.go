package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"acovia.net/opt"
	"acovia.net/record"
)

const version = "0.0.8-beta"

var (
	cmdMap map[string]CmdFunc

	cmd        string
	subCmdArgs []string

	addrFlag          string
	portFlag          string
	rootFlag          string
	userFlag          string
	passwordFlag      string
	allowOriginFlag   string
	upfileMaxSizeFlag string
	quietFlag         bool
	server            *Server

	configChanged bool
)

type CmdFunc struct {
	Function   func() error
	LoadConfig bool
}

func main() {
	if err := initProgram(); err != nil {
		record.Error(err)
	}

	if err := initConfigPath(); err != nil {
		record.Error(err)
	}

	function, ok := cmdMap[cmd]
	if !ok {
		record.Error("unknown command:", cmd)
	}

	if function.LoadConfig {
		if err := loadConfig(); err != nil {
			record.Error(err)
		}

		if err := parseFlag(); err != nil {
			record.Error(err)
		}
	}

	if err := function.Function(); err != nil {
		record.Error(err)
	}
}

func newCmdFunction(loadConfig bool, function func() error) CmdFunc {
	return CmdFunc{
		LoadConfig: loadConfig,
		Function:   function,
	}
}

func initProgram() error {
	cmdMap = map[string]CmdFunc{
		"run":    newCmdFunction(true, run),
		"config": newCmdFunction(true, setConfig),
		"unset":  newCmdFunction(true, unsetConfig),
		"about":  newCmdFunction(false, about),
		"help":   newCmdFunction(false, help),
	}

	opt.StringVar(&addrFlag, "i", "addr", "")
	opt.StringVar(&portFlag, "p", "port", "")
	opt.StringVar(&rootFlag, "r", "root", "")
	opt.StringVar(&userFlag, "u", "user", "")
	opt.StringVar(&upfileMaxSizeFlag, "x", "max-size", "")
	opt.StringVar(&passwordFlag, "P", "password", "")
	opt.StringVar(&allowOriginFlag, "o", "cross-origin", "")

	opt.BoolSwitch(&quietFlag, "q", "quiet")
	opt.BoolSwitch(&record.EnableColor, "c", "color")
	opt.BoolSwitch(&record.EnableTimestamp, "t", "time")

	opt.BoolFunc("h", "help", func() {
		record.Print(helpText)
		os.Exit(0)
	})

	opt.BoolFunc("", "version", func() {
		record.Println("next-index", version)
		os.Exit(0)
	})

	if err := opt.Parse(); err != nil {
		return err
	}

	args := opt.Args()

	if len(args) == 0 {
		cmd = "run"
		return nil
	}

	if _, ok := cmdMap[args[0]]; ok {
		cmd = args[0]
		subCmdArgs = args[1:]
		return nil
	}

	if isDirectory(args[0]) || looksLikePath(args[0]) {
		cmd = "run"
		subCmdArgs = args
		return nil
	}

	return fmt.Errorf("unknown command: %v, run `next-index help` for usage", args[0])
}

func isDirectory(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}

	return info.IsDir()
}

func looksLikePath(value string) bool {
	return strings.ContainsAny(value, `/\`) || value == "." || value == ".." || strings.HasPrefix(value, "~")
}

func parseFlag() error {
	if addrFlag != "" {
		config.Addr = addrFlag
		configChanged = true
	}

	if portFlag != "" {
		port, err := strconv.Atoi(portFlag)
		if err != nil || port <= 0 || port > 65535 {
			return fmt.Errorf("invalid port: %v", portFlag)
		}

		configChanged = true
		config.Port = port
	}

	if rootFlag != "" {
		rootPath := expandHome(rootFlag)

		absolute, err := filepath.Abs(rootPath)
		if err != nil {
			return fmt.Errorf("root: %w", err)
		}

		info, err := os.Stat(absolute)
		if err != nil {
			return fmt.Errorf("root: %w", err)
		}

		if !info.IsDir() {
			return fmt.Errorf("root is not a directory: %v", absolute)
		}

		config.Root = absolute
		configChanged = true
	}

	if userFlag != "" {
		config.Username = userFlag
		configChanged = true
	}

	if passwordFlag != "" {
		if len(passwordFlag) < 8 {
			record.Warn("this password is shorter than 8 characters")
		}

		config.Password = hashPassword(passwordFlag)
		configChanged = true
	}

	if upfileMaxSizeFlag != "" {
		var err error
		config.MaxUploadMB, err = strconv.ParseInt(upfileMaxSizeFlag, 10, 64)
		if err != nil {
			return fmt.Errorf("parse max size option: %w", err)
		}
		configChanged = true
	}

	if allowOriginFlag != "" {
		origin, err := normalizeOrigin(allowOriginFlag)
		if err != nil {
			return fmt.Errorf("cross-origin: %w", err)
		}

		config.AllowOrigin = origin
		configChanged = true
	}

	return nil
}

func normalizeOrigin(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("must start with http:// or https://")
	}

	if parsed.Host == "" {
		return "", fmt.Errorf("missing host")
	}

	if parsed.Path != "" && parsed.Path != "/" {
		return "", fmt.Errorf("must not contain a path")
	}

	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), nil
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
		record.Error("usage: next-index unset <value>")
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}

	var newConfig map[string]any
	err = json.Unmarshal(data, &newConfig)
	if err != nil {
		return fmt.Errorf("unmarshal json data:, %w", err)
	}

	if _, ok := newConfig[subCmdArgs[0]]; !ok {
		return fmt.Errorf("value not found")
	}

	delete(newConfig, subCmdArgs[0])

	data, err = json.MarshalIndent(newConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal json data:, %w", err)
	}

	if err := writeConfigFile(data); err != nil {
		return err
	}

	return nil
}

func about() error {
	record.Println("NEXT_INDEX", version)
	record.Println("a small, plain web file server with uploads and file management")
	record.Println("github link: https://github.com/fovlin/next-index")
	record.Println("license: GNU General Public License v3")
	record.Println()
	record.Println("built with", runtime.Version(), "·", runtime.GOOS+"/"+runtime.GOARCH)
	record.Println("config file:", configPath)

	return nil
}

func help() error {
	record.Print(helpText)

	return nil
}

const helpText = `NEXT_INDEX — a small, plain web file server

usage:
  next-index [command] [options] [root]

commands:
  run        serve a directory over http (default)
  config     update the config from flags, or print it
  about      print build information
  help       print this message

options:
  -i, --addr <ip>        address for run/config (default: 0.0.0.0)
  -p, --port <port>      port for run/config (default: 8080)
  -r, --root <dir>       root directory for run/config
  -u, --user <name>      username for run/config
  -P, --password <pass>  password for run/config (hashed; leaks into shell history)
  -x, --max-size <mb>    max upload size in megabytes (0 for no limit)
  -q, --quiet            do not log every request
  -o, --cross-origin <origin>  exact Origin allowed to call the API (experimental)
  -c, --color            colored log output
  -t, --time             timestamp every log line
      --version          print the version
  -h, --help             print this message

examples:
  next-index ~/Downloads
  next-index run -p 9000 -i 127.0.0.1 ./public
  next-index config -p 9000 -i 127.0.0.1
  next-index config -u admin -P "new password"
  next-index config -r ~/Downloads
  next-index config -o http://localhost:3000
  next-index config

config:
  ~/.next_index.json stores the root, address, port, credentials and limits.
  The password is stored as a SHA-256 hash.
  config without flags prints the file; with flags it saves them.
  config and run create the file on first use; later run flags are not saved.

browsing is public; the username and password are only required to upload
files or to rename, create and delete them.
`
