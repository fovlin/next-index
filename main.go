package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"

	"acovia.net/opt"
	"acovia.net/record"
	"golang.org/x/term"
)

const version = "0.1.0"

var (
	cmdMap map[string]func() error

	cmd        string
	subCmdArgs []string

	addrFlag     string
	portFlag     string
	rootFlag     string
	userFlag     string
	passwordFlag string
	quietFlag    bool

	configCreated bool
	stdinReader   *bufio.Reader
)

func main() {
	if err := initProgram(); err != nil {
		record.Error(err)
	}

	if err := initConfigPath(); err != nil {
		record.Error(err)
	}

	created, err := loadConfig()
	if err != nil {
		record.Error(err)
	}

	configCreated = created

	function, ok := cmdMap[cmd]
	if !ok {
		record.Error("unknown command:", cmd)
	}

	if err := function(); err != nil {
		record.Error(err)
	}
}

func initProgram() error {
	cmdMap = map[string]func() error{
		"serve":  serve,
		"passwd": changePassword,
		"config": showConfig,
		"about":  about,
		"help":   help,
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
		cmd = "serve"
		return nil
	}

	if _, ok := cmdMap[args[0]]; ok {
		cmd = args[0]
		subCmdArgs = args[1:]
		return nil
	}

	if isDirectory(args[0]) || looksLikePath(args[0]) {
		cmd = "serve"
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

func changePassword() error {
	if len(subCmdArgs) > 0 {
		return fmt.Errorf("usage: next-index passwd [-u user] [-P password]")
	}

	username := config.Username
	if userFlag != "" {
		username = userFlag
	}

	if username == "" {
		username = defaultUsername
	}

	password := passwordFlag

	if password == "" {
		first, err := promptPassword("New password: ")
		if err != nil {
			return err
		}

		if first == "" {
			return fmt.Errorf("password must not be empty")
		}

		second, err := promptPassword("Confirm password: ")
		if err != nil {
			return err
		}

		if first != second {
			return fmt.Errorf("passwords do not match")
		}

		password = first
	}

	if password == "" {
		return fmt.Errorf("password must not be empty")
	}

	if len(password) < 8 {
		record.Warn("this password is shorter than 8 characters")
	}

	hashed, err := hashPassword(password)
	if err != nil {
		return err
	}

	config.Username = username
	config.Password = hashed

	if err := saveConfig(); err != nil {
		return err
	}

	record.Info("credentials updated for", username)
	record.Info("config saved to", configPath)

	return nil
}

func promptPassword(prompt string) (string, error) {
	fmt.Fprint(os.Stdout, prompt)

	descriptor := int(os.Stdin.Fd())

	if term.IsTerminal(descriptor) {
		// Restore the terminal if the user leaves the prompt with Ctrl+C or
		// SIGTERM. ReadPassword only restores it on a normal return, so a
		// signal would otherwise leave echo turned off.
		state, stateErr := term.GetState(descriptor)
		if stateErr == nil {
			interrupt := make(chan os.Signal, 1)
			done := make(chan struct{})

			signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
			defer close(done)
			defer signal.Stop(interrupt)

			go func() {
				select {
				case <-interrupt:
					term.Restore(descriptor, state)
					fmt.Fprintln(os.Stdout)
					os.Exit(130)
				case <-done:
				}
			}()
		}

		data, err := term.ReadPassword(descriptor)
		fmt.Fprintln(os.Stdout)

		if err != nil {
			return "", fmt.Errorf("read password: %w", err)
		}

		return string(data), nil
	}

	if stdinReader == nil {
		stdinReader = bufio.NewReader(os.Stdin)
	}

	line, err := stdinReader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("read password: %w", err)
	}

	fmt.Fprintln(os.Stdout)

	return strings.TrimRight(line, "\r\n"), nil
}

func showConfig() error {
	if configFromLegacy {
		record.Info("config file:", configPath, "(not created yet)")
		record.Warn("reading legacy config from", legacyConfigPath+", it will be migrated on the next serve or passwd")
	} else {
		info, err := os.Stat(configPath)

		switch true {
		case err == nil:
			record.Info("config file:", configPath, fmt.Sprintf("(%d bytes)", info.Size()))

		case os.IsNotExist(err):
			record.Info("config file:", configPath, "(not created yet, the first `next-index serve` will create it)")

		default:
			return fmt.Errorf("stat config file: %w", err)
		}
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
  serve      serve a directory over http (default)
  passwd     set the username and password used for uploads
  config     print the config file and its location
  about      print build information
  help       print this message

options:
  -a, --addr <ip>        address to listen on (default: 0.0.0.0)
  -p, --port <port>      port to listen on (default: 8080)
  -r, --root <dir>       directory to serve
  -u, --user <name>      username for passwd
  -P, --password <pass>  password for passwd (leaks into shell history)
  -q, --quiet            do not log every request
  -c, --color            colored log output
  -t, --time             timestamp every log line
      --version          print the version
  -h, --help             print this message

examples:
  next-index ~/Downloads
  next-index serve -p 9000 -a 127.0.0.1 ./public
  next-index passwd -u admin

config:
  ~/.next_index.json stores the root, address, port, credentials and limits.
  The password is stored as a salted pbkdf2-sha256 hash.

browsing is public; the username and password are only required to upload
files or to rename, create and delete them.
`
