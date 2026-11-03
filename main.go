package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"acovia.net/opt"
	"acovia.net/record"
)

const version = "v0.0.1-alpha"

var (
	cmdMap map[string]CmdFunc

	cmd        string
	subCmdArgs []string

	addrFlag     string
	portFlag     string
	rootFlag     string
	userFlag     string
	passwordFlag string
	quietFlag    bool

	needSaveConfig bool
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
		"config": newCmdFunction(true, manageConfig),
		"about":  newCmdFunction(false, about),
		"help":   newCmdFunction(false, help),
	}

	opt.StringVar(&addrFlag, "a", "addr", "")
	opt.StringVar(&portFlag, "p", "port", "")
	opt.StringVar(&rootFlag, "r", "root", "")
	opt.StringVar(&userFlag, "u", "user", "")
	opt.StringVar(&passwordFlag, "P", "password", "")

	opt.BoolSwitch(&quietFlag, "q", "quiet")
	opt.BoolSwitch(&record.EnableColor, "c", "color")
	opt.BoolSwitch(&record.EnableTimestamp, "t", "time")

	opt.BoolFunc("h", "help", func() {
		printHelp()
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
		needSaveConfig = true
	}

	if portFlag != "" {
		port, err := strconv.Atoi(portFlag)
		if err != nil || port <= 0 || port > 65535 {
			return fmt.Errorf("invalid port: %v", portFlag)
		}

		needSaveConfig = true
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
		needSaveConfig = true
	}

	if userFlag != "" {
		config.Username = userFlag
		needSaveConfig = true
	}

	if passwordFlag != "" {
		if len(passwordFlag) < 8 {
			record.Warn("this password is shorter than 8 characters")
		}

		config.Password = hashPassword(passwordFlag)
		needSaveConfig = true
	}

	return nil
}

func manageConfig() error {
	if needSaveConfig {
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
	printHelp()
	return nil
}

func printHelp() {
	record.Print(helpText)
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
  -a, --addr <ip>        address for run/config (default: 0.0.0.0)
  -p, --port <port>      port for run/config (default: 8080)
  -r, --root <dir>       root directory for run/config
  -u, --user <name>      username for run/config
  -P, --password <pass>  password for run/config (hashed; leaks into shell history)
  -q, --quiet            do not log every request
  -c, --color            colored log output
  -t, --time             timestamp every log line
      --version          print the version
  -h, --help             print this message

examples:
  next-index ~/Downloads
  next-index run -p 9000 -a 127.0.0.1 ./public
  next-index config -p 9000 -a 127.0.0.1
  next-index config -u admin -P "new password"
  next-index config -r ~/Downloads
  next-index config

config:
  ~/.next_index.json stores the root, address, port, credentials and limits.
  The password is stored as a SHA-256 hash.
  config without flags prints the file; with flags it saves them and prints the result.
  config and run create the file on first use; later run flags are not saved.

browsing is public; the username and password are only required to upload
files or to rename, create and delete them.
`
