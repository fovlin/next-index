package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"acovia.net/record"
)

var (
	errInvalidPath  = errors.New("invalid path")
	errOutsideRoot  = errors.New("path is outside of the root directory")
	errNotDirectory = errors.New("not a directory")
	errInvalidName  = errors.New("invalid file name")
)

var thumbnailExtensions = map[string]bool{
	"avif": true,
	"bmp":  true,
	"gif":  true,
	"ico":  true,
	"jpeg": true,
	"jpg":  true,
	"png":  true,
	"svg":  true,
	"webp": true,
}

var attachmentExtensions = map[string]bool{
	"htm":   true,
	"html":  true,
	"js":    true,
	"mjs":   true,
	"svg":   true,
	"xhtml": true,
	"xml":   true,
	"xsl":   true,
	"xslt":  true,
}

var reservedNames = map[string]bool{
	"aux":  true,
	"con":  true,
	"nul":  true,
	"prn":  true,
	"com1": true,
	"com2": true,
	"com3": true,
	"com4": true,
	"com5": true,
	"com6": true,
	"com7": true,
	"com8": true,
	"com9": true,
	"lpt1": true,
	"lpt2": true,
	"lpt3": true,
	"lpt4": true,
	"lpt5": true,
	"lpt6": true,
	"lpt7": true,
	"lpt8": true,
	"lpt9": true,
}

type Entry struct {
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Size   int64  `json:"size"`
	Mod    int64  `json:"mod"`
	Ext    string `json:"ext"`
	Href   string `json:"href"`
	Link   bool   `json:"link,omitempty"`
	Target string `json:"target,omitempty"`
	Thumb  bool   `json:"thumb,omitempty"`
}

type Crumb struct {
	Name string `json:"name"`
	Href string `json:"href"`
}

type listing struct {
	Path    string  `json:"path"`
	Parent  Entry   `json:"parent"`
	Crumbs  []Crumb `json:"crumbs"`
	Entries []Entry `json:"entries"`
}

func (server *Server) buildListing(fsPath string) (*listing, error) {
	info, err := server.Root.Stat(fsPath)
	record.Debug(fsPath)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		return nil, errNotDirectory
	}

	entries, err := readEntries(fsPath)
	if err != nil {
		return nil, err
	}

	var parentPath = "/"

	if fsPath != "." {
		parentPath = ".."
	}

	return &listing{
		Path:    formatUrlPath(fsPath, true),
		Crumbs:  makeCrumbs(fsPath),
		Entries: entries,
		Parent: Entry{
			Kind: "parent",
			Href: "../",
			Name: parentPath,
			Size: info.Size(),
			Mod:  info.ModTime().Unix(),
		},
	}, nil
}

func readEntries(fsPath string) ([]Entry, error) {
	dirEntries, err := os.ReadDir(path.Join(server.Root.Name(), fsPath))
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(dirEntries))

	for _, dirEntry := range dirEntries {
		info, err := dirEntry.Info()
		if err != nil {
			continue
		}

		name := dirEntry.Name()

		if strings.HasPrefix(name, ".next_index-upload-") || strings.HasPrefix(name, ".next_index-") {
			continue
		}

		entry := Entry{
			Name: name,
			Kind: "file",
			Size: info.Size(),
			Mod:  info.ModTime().Unix(),
			Ext:  strings.ToLower(strings.TrimPrefix(filepath.Ext(name), ".")),
		}

		switch true {
		case info.IsDir():
			entry.Href = formatUrlPath(path.Join(fsPath, name), true)
			entry.Kind = "dir"
			entry.Size = 0

		case !info.IsDir():
			entry.Href = formatUrlPath(path.Join(fsPath, name), false)

		}

		entry.Thumb = entry.Kind == "file" && thumbnailExtensions[entry.Ext]

		entries = append(entries, entry)
	}

	sort.SliceStable(entries, func(left int, right int) bool {
		leftIsDir := entries[left].Kind == "dir"
		rightIsDir := entries[right].Kind == "dir"

		if leftIsDir != rightIsDir {
			return leftIsDir
		}

		return strings.ToLower(entries[left].Name) < strings.ToLower(entries[right].Name)
	})

	return entries, nil
}

func formatUrlPath(fsPath string, isDir bool) string {
	fsPath = path.Clean(fsPath)
	if !strings.HasPrefix(fsPath, "/") {
		fsPath = "/" + fsPath
	}
	if isDir && !strings.HasSuffix(fsPath, "/") {
		fsPath = fsPath + "/"
	}

	return fsPath
}

func makeCrumbs(urlPath string) []Crumb {
	crumbs := []Crumb{{Name: "root", Href: "/"}}

	trimmed := strings.Trim(urlPath, "/")
	if trimmed == "" {
		return crumbs
	}

	accumulated := ""

	for _, part := range strings.Split(trimmed, "/") {
		accumulated += "/" + part
		crumbs = append(crumbs, Crumb{
			Name: part,
			Href: (&url.URL{Path: accumulated}).EscapedPath() + "/",
		})
	}

	return crumbs
}

func (server *Server) serveFile(w http.ResponseWriter, r *http.Request, fsPath string, info os.FileInfo) {
	file, err := server.Root.Open(fsPath)
	if err != nil {
		server.fail(w, r, http.StatusNotFound, "file not found")
		return
	}
	defer file.Close()

	extension := strings.ToLower(strings.TrimPrefix(filepath.Ext(info.Name()), "."))

	if attachmentExtensions[extension] {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
			"filename": info.Name(),
		}))
	}

	w.Header().Set("Cache-Control", "no-cache")

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func sanitizeName(name string) (string, error) {
	name = strings.ReplaceAll(name, "\\", "/")
	name = path.Base(name)
	name = strings.TrimSpace(name)

	if name == "" || name == "." || name == ".." || name == "/" {
		return "", errInvalidName
	}

	name = strings.Map(func(char rune) rune {
		switch true {
		case char < 0x20, char == 0x7f:
			return -1

		case strings.ContainsRune(`/*?:"<>|`, char):
			return '_'
		}

		return char
	}, name)

	if name == "" || name == "." || name == ".." {
		return "", errInvalidName
	}

	if strings.HasPrefix(name, ".next_index-") {
		return "", errInvalidName
	}

	base := name
	extension := filepath.Ext(base)
	if len(extension) > 32 {
		extension = ""
		base = name
	}

	stem := strings.TrimSuffix(base, extension)

	if reservedNames[strings.ToLower(stem)] {
		name = "_" + name
		stem = "_" + stem
	}

	if len(name) > 200 {
		suffix := extension
		if len(suffix) > 32 {
			suffix = ""
		}

		const limit = 200
		runes := []rune(stem)

		for len(runes) > 0 && len(string(runes))+len(suffix) > limit {
			runes = runes[:len(runes)-1]
		}

		name = string(runes) + suffix
	}

	return name, nil
}

func validateName(name string) (string, error) {
	if name == "" || name == "." || name == ".." {
		return "", errInvalidName
	}

	if strings.ContainsAny(name, "/\\") {
		return "", errInvalidName
	}

	if strings.TrimSpace(name) != name {
		return "", errInvalidName
	}

	for _, char := range name {
		if char < 0x20 || char == 0x7f {
			return "", errInvalidName
		}
	}

	if len(name) > 200 {
		return "", errInvalidName
	}

	if strings.HasPrefix(name, ".next_index-") {
		return "", errInvalidName
	}

	stem := strings.TrimSuffix(name, filepath.Ext(name))
	if reservedNames[strings.ToLower(stem)] {
		return "", errInvalidName
	}

	return name, nil
}

func uniquePath(dir string, name string) (string, error) {
	candidate := filepath.Join(dir, name)

	if _, err := os.Lstat(candidate); os.IsNotExist(err) {
		return candidate, nil
	} else if err != nil {
		return "", err
	}

	extension := filepath.Ext(name)
	stem := strings.TrimSuffix(name, extension)

	for index := 1; index < 10000; index++ {
		candidate = filepath.Join(dir, fmt.Sprintf("%s-%d%s", stem, index, extension))

		if _, err := os.Lstat(candidate); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
	}

	return "", fmt.Errorf("too many files with the same name: %v", name)
}

func copyUpload(dir string, source io.Reader, overwrite bool, name string) (string, int64, error) {
	target := filepath.Join(dir, name)

	if overwrite {
		if info, err := server.Root.Stat(target); err == nil && info.IsDir() {
			return "", 0, fmt.Errorf("%v is a directory", name)
		}
	} else {
		var err error
		target, err = uniquePath(dir, name)
		if err != nil {
			return "", 0, err
		}
	}

	var tempName string
	for {
		var token = make([]byte, 8)
		io.ReadFull(rand.Reader, token)
		subfix := hex.EncodeToString(token)
		tempName = name + "-" + subfix
		_, err := server.Root.Stat(tempName)
		if os.IsNotExist(err) {
			break
		}
	}

	temp, err := server.Root.Create(tempName)
	if err != nil {
		return "", 0, fmt.Errorf("create upload file: %w", err)
	}

	cleanup := func() {
		temp.Close()
		server.Root.Remove(tempName)
	}

	size, err := io.Copy(temp, source)
	if err != nil {
		cleanup()
		return "", 0, fmt.Errorf("write upload file: %w", err)
	}

	if err := temp.Chmod(0644); err != nil {
		cleanup()
		return "", 0, fmt.Errorf("change upload permissions: %w", err)
	}

	if err := temp.Close(); err != nil {
		server.Root.Remove(tempName)
		return "", 0, fmt.Errorf("close upload file: %w", err)
	}

	if err := server.Root.Rename(tempName, target); err != nil {
		if !overwrite || server.Root.Remove(target) != nil {
			server.Root.Remove(tempName)
			return "", 0, fmt.Errorf("store upload file: %w", err)
		}

		if err := server.Root.Rename(tempName, target); err != nil {
			server.Root.Remove(tempName)
			return "", 0, fmt.Errorf("replace existing file: %w", err)
		}
	}

	return filepath.Base(target), size, nil
}
