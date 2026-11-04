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
	Parent  string  `json:"parent"`
	Crumbs  []Crumb `json:"crumbs"`
	Entries []Entry `json:"entries"`
}

func (server *Server) resolve(urlPath string) (string, error) {
	if !strings.HasPrefix(urlPath, "/") {
		urlPath = "/" + urlPath
	}

	cleanPath := path.Clean(urlPath)
	fsPath := filepath.Join(server.root, filepath.FromSlash(cleanPath))

	relative, err := filepath.Rel(server.root, fsPath)
	if err != nil {
		return "", errInvalidPath
	}

	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errOutsideRoot
	}

	return fsPath, nil
}

func (server *Server) ensureReal(fsPath string) error {
	realPath, err := filepath.EvalSymlinks(fsPath)
	if err != nil {
		return err
	}

	relative, err := filepath.Rel(server.root, realPath)
	if err != nil {
		return errInvalidPath
	}

	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errOutsideRoot
	}

	return nil
}

func (server *Server) buildListing(urlPath string) (*listing, error) {
	fsPath, err := server.resolve(urlPath)
	if err != nil {
		return nil, err
	}

	if err := server.ensureReal(fsPath); err != nil {
		return nil, err
	}

	info, err := os.Stat(fsPath)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		return nil, errNotDirectory
	}

	entries, err := readEntries(fsPath, urlPath)
	if err != nil {
		return nil, err
	}

	return &listing{
		Path:    urlPath,
		Parent:  parentURL(urlPath),
		Crumbs:  makeCrumbs(urlPath),
		Entries: entries,
	}, nil
}

func readEntries(fsPath string, urlPath string) ([]Entry, error) {
	dirEntries, err := os.ReadDir(fsPath)
	if err != nil {
		return nil, err
	}


	entries := make([]Entry, 0, len(dirEntries))

	if urlPath != "/" {
		parentDirInfo, err := os.Lstat("../")
		if err != nil {
			return nil, fmt.Errorf("stat parent directory: %w", err)
		}
		entries = append(entries, Entry{
			Name: parentDirInfo.Name(),
			Href: parentDirInfo.Name(),
			Kind: "dir",
			Size: parentDirInfo.Size(),
			Mod:  parentDirInfo.ModTime().Unix(),
			Ext:  strings.ToLower(strings.TrimPrefix(filepath.Ext(parentDirInfo.Name()), ".")),
		})
	}

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

		if info.IsDir() {
			entry.Kind = "dir"
			entry.Size = 0
		}

		if dirEntry.Type()&os.ModeSymlink != 0 {
			entry.Link = true

			if target, err := os.Readlink(filepath.Join(fsPath, name)); err == nil {
				entry.Target = target
			}

			if stat, err := os.Stat(filepath.Join(fsPath, name)); err == nil && stat.IsDir() {
				entry.Kind = "dir"
				entry.Size = 0
			}
		}

		entry.Href = hrefFor(urlPath, name, entry.Kind == "dir")
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

func hrefFor(basePath string, name string, isDir bool) string {
	joined := path.Join(basePath, name)
	if isDir {
		joined += "/"
	}

	escaped := (&url.URL{Path: joined}).EscapedPath()

	return escaped
}

func parentURL(urlPath string) string {
	if urlPath == "" || urlPath == "/" {
		return ""
	}

	parent := path.Dir(strings.TrimSuffix(urlPath, "/"))
	if parent == "/" {
		return "/"
	}

	return (&url.URL{Path: parent + "/"}).EscapedPath()
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
		if info, err := os.Lstat(target); err == nil && info.IsDir() {
			return "", 0, fmt.Errorf("%v is a directory", name)
		}
	} else {
		var err error
		target, err = uniquePath(dir, name)
		if err != nil {
			return "", 0, err
		}
	}

	temp, err := os.CreateTemp(dir, ".next_index-upload-*")
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
		// On systems where rename cannot replace an existing file, remove the
		// old file and try once more. On unix the rename above is atomic.
		if !overwrite || os.Remove(target) != nil {
			os.Remove(tempPath)
			return "", 0, fmt.Errorf("store upload file: %w", err)
		}

		if err := os.Rename(tempPath, target); err != nil {
			os.Remove(tempPath)
			return "", 0, fmt.Errorf("replace existing file: %w", err)
		}
	}

	return filepath.Base(target), size, nil
}
