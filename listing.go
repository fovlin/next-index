package main

import (
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
)

const (
	maxNameLength  = 200
	tempNamePrefix = ".next_index-"
)

var (
	errInvalidPath  = errors.New("invalid path")
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
	info, err := os.Stat(fsPath)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		return nil, errNotDirectory
	}

	entries, err := server.readEntries(fsPath)
	if err != nil {
		return nil, err
	}

	urlPath := server.urlPath(fsPath, true)

	parentName := ".."
	if fsPath == server.Root {
		parentName = "/"
	}

	return &listing{
		Path:    urlPath,
		Crumbs:  makeCrumbs(urlPath),
		Entries: entries,
		Parent: Entry{
			Kind: "parent",
			Href: "../",
			Name: parentName,
			Size: info.Size(),
			Mod:  info.ModTime().Unix(),
		},
	}, nil
}

func (server *Server) readEntries(fsPath string) ([]Entry, error) {
	dirEntries, err := os.ReadDir(fsPath)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(dirEntries))

	for _, dirEntry := range dirEntries {
		name := dirEntry.Name()

		if isTempName(name) {
			continue
		}

		info, err := dirEntry.Info()
		if err != nil {
			continue
		}

		fullPath := filepath.Join(fsPath, name)
		isLink := info.Mode()&os.ModeSymlink != 0

		if isLink {
			if stat, err := os.Stat(fullPath); err == nil {
				info = stat
			}
		}

		entry := Entry{
			Name: name,
			Kind: "file",
			Size: info.Size(),
			Mod:  info.ModTime().Unix(),
			Ext:  strings.ToLower(strings.TrimPrefix(filepath.Ext(name), ".")),
			Link: isLink,
		}

		if isLink {
			entry.Target, _ = os.Readlink(fullPath)
		}

		if info.IsDir() {
			entry.Kind = "dir"
			entry.Size = 0
		}

		entry.Href = (&url.URL{Path: server.urlPath(fullPath, entry.Kind == "dir")}).EscapedPath()
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
	file, err := os.Open(fsPath)
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

	if isTempName(name) {
		return "", errInvalidName
	}

	extension := filepath.Ext(name)
	if len(extension) > 32 {
		extension = ""
	}

	stem := strings.TrimSuffix(name, extension)
	if reservedStem(name) {
		stem = "_" + stem
		name = "_" + name
	}

	if len(name) > maxNameLength {
		runes := []rune(stem)

		for len(runes) > 0 && len(string(runes))+len(extension) > maxNameLength {
			runes = runes[:len(runes)-1]
		}

		name = string(runes) + extension
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

	if len(name) > maxNameLength {
		return "", errInvalidName
	}

	if isTempName(name) {
		return "", errInvalidName
	}

	if reservedStem(name) {
		return "", errInvalidName
	}

	return name, nil
}

func isTempName(name string) bool {
	return strings.HasPrefix(name, tempNamePrefix)
}

func reservedStem(name string) bool {
	return reservedNames[strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))]
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
		if info, err := os.Stat(target); err == nil && info.IsDir() {
			return "", 0, fmt.Errorf("%v is a directory", name)
		}
	} else {
		var err error
		if target, err = uniquePath(dir, name); err != nil {
			return "", 0, err
		}
	}

	temp, err := os.CreateTemp(dir, tempNamePrefix+"upload-*")
	if err != nil {
		return "", 0, fmt.Errorf("create upload file: %w", err)
	}

	tempPath := temp.Name()

	cleanup := func() {
		temp.Close()
		os.Remove(tempPath)
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
		os.Remove(tempPath)
		return "", 0, fmt.Errorf("close upload file: %w", err)
	}

	if err := os.Rename(tempPath, target); err != nil {
		os.Remove(tempPath)
		return "", 0, fmt.Errorf("store upload file: %w", err)
	}

	return filepath.Base(target), size, nil
}
