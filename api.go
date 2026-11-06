package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type sessionResponse struct {
	Authenticated bool   `json:"authenticated"`
	Username      string `json:"username,omitempty"`
	Writable      bool   `json:"writable"`
	Version       string `json:"version"`
	MaxUploadMB   int64  `json:"maxUploadMB"`
}

type requestPath struct {
	Path  string   `json:"path"`
	Name  string   `json:"name"`
	From  string   `json:"from"`
	To    string   `json:"to"`
	Names []string `json:"names"`
}

type uploadResult struct {
	Name  string `json:"name"`
	Size  int64  `json:"size"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

func (server *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, server.session(server.authenticated(r)))
}

func (server *Server) session(authenticated bool) sessionResponse {
	response := sessionResponse{
		Authenticated: authenticated,
		Writable:      server.Config.writable(),
		Version:       version,
		MaxUploadMB:   server.Config.MaxUploadMB,
	}

	if authenticated {
		response.Username = server.Config.Username
	}

	return response
}

func (server *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		server.apiError(w, http.StatusForbidden, "cross-origin request blocked")
		return
	}

	if !server.Config.writable() {
		server.apiError(w, http.StatusForbidden, "write access is disabled, run `next-index config -P <password>` on the server")
		return
	}

	key := clientIP(r)

	if !server.Limiter.allow(key) {
		w.Header().Set("Retry-After", "300")
		server.apiError(w, http.StatusTooManyRequests, "too many failed attempts, try again later")
		return
	}

	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := decodeJSONBody(r, &request); err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if !server.checkCredentials(request.Username, request.Password) {
		server.Limiter.fail(key)
		server.apiError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	token, err := server.Sessions.create()
	if err != nil {
		server.apiError(w, http.StatusInternalServerError, "could not create session")
		return
	}

	server.Limiter.reset(key)
	server.setSessionCookie(w, r, token)

	writeJSON(w, http.StatusOK, server.session(true))
}

func (server *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		server.apiError(w, http.StatusForbidden, "cross-origin request blocked")
		return
	}

	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		server.Sessions.destroy(cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || server.Config.TLS.Enable,
	})

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (server *Server) handleList(w http.ResponseWriter, r *http.Request) {
	fsPath, err := server.resolveUrlPath(r.URL.Query().Get("path"))
	if err != nil {
		server.failAPI(w, err)
		return
	}

	list, err := server.buildListing(fsPath)
	if err != nil {
		server.failAPI(w, err)
		return
	}

	writeJSON(w, http.StatusOK, list)
}

func (server *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if !server.checkWrite(w, r) {
		return
	}

	dirPath, err := server.resolveUrlPath(r.URL.Query().Get("path"))
	if err != nil {
		server.failAPI(w, err)
		return
	}

	if server.Config.MaxUploadMB > 0 {
		limit := server.Config.MaxUploadMB << 20
		r.Body = http.MaxBytesReader(w, r.Body, limit)
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		if r.MultipartForm != nil {
			r.MultipartForm.RemoveAll()
		}

		var maxBytesError *http.MaxBytesError

		if errors.As(err, &maxBytesError) {
			server.apiError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("upload exceeds the %d MB limit", server.Config.MaxUploadMB))
		} else {
			server.apiError(w, http.StatusBadRequest, "invalid upload request")
		}

		return
	}

	defer r.MultipartForm.RemoveAll()

	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		server.apiError(w, http.StatusBadRequest, "no files in request")
		return
	}

	overwrite := r.URL.Query().Get("overwrite") == "1"

	results := make([]uploadResult, 0, len(files))

	server.FsMutex.Lock()
	defer server.FsMutex.Unlock()

	for _, header := range files {
		name, err := sanitizeName(header.Filename)
		if err != nil {
			results = append(results, uploadResult{
				Name:  header.Filename,
				Error: "invalid file name",
			})
			continue
		}

		source, err := header.Open()
		if err != nil {
			results = append(results, uploadResult{
				Name:  name,
				Error: "could not read the upload",
			})
			continue
		}

		storedName, size, err := copyUpload(dirPath, source, overwrite, name)
		source.Close()

		if err != nil {
			results = append(results, uploadResult{
				Name:  name,
				Error: err.Error(),
			})
			continue
		}

		results = append(results, uploadResult{
			Name: storedName,
			Size: size,
			OK:   true,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"files": results})
}

func (server *Server) handleMkdir(w http.ResponseWriter, r *http.Request) {
	if !server.checkWrite(w, r) {
		return
	}

	var request requestPath

	if err := decodeJSONBody(r, &request); err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	name, err := validateName(request.Name)
	if err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid directory name")
		return
	}

	target, err := server.resolveUrlPath(path.Join(request.Path, name))
	if err != nil {
		server.failAPI(w, err)
		return
	}

	server.FsMutex.Lock()
	defer server.FsMutex.Unlock()

	if err := os.Mkdir(target, 0755); err != nil {
		server.apiError(w, http.StatusInternalServerError, "could not create the directory")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"name": name})
}

func (server *Server) handleRename(w http.ResponseWriter, r *http.Request) {
	if !server.checkWrite(w, r) {
		return
	}

	var request requestPath

	if err := decodeJSONBody(r, &request); err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	from, err := validateName(request.From)
	if err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid source name")
		return
	}

	to, err := validateName(request.To)
	if err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid target name")
		return
	}

	if from == to {
		writeJSON(w, http.StatusOK, map[string]string{"name": to})
		return
	}

	fromPath, err := server.resolveUrlPath(path.Join(request.Path, from))
	if err != nil {
		server.failAPI(w, err)
		return
	}

	toPath, err := server.resolveUrlPath(path.Join(request.Path, to))
	if err != nil {
		server.failAPI(w, err)
		return
	}

	if _, err := os.Stat(toPath); err == nil {
		server.apiError(w, http.StatusConflict, "file or folder with this name already exists")
		return
	}

	server.FsMutex.Lock()
	defer server.FsMutex.Unlock()

	if err := os.Rename(fromPath, toPath); err != nil {
		server.apiError(w, http.StatusInternalServerError, "could not rename the file: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"name": to})
}

func (server *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if !server.checkWrite(w, r) {
		return
	}

	var request requestPath

	if err := decodeJSONBody(r, &request); err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(request.Names) == 0 {
		server.apiError(w, http.StatusBadRequest, "nothing to delete")
		return
	}

	names, err := checkedNames(request.Names)
	if err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid file name")
		return
	}

	server.FsMutex.Lock()
	defer server.FsMutex.Unlock()

	deleted := make([]string, 0, len(names))

	type deleteObject struct {
		name   string
		target string
	}

	var deleteList []deleteObject

	for _, name := range names {
		target, err := server.resolveUrlPath(path.Join(request.Path, name))
		if err != nil {
			server.failAPI(w, err)
			return
		}
		deleteList = append(deleteList, deleteObject{
			name:   name,
			target: target,
		})
	}

	for _, object := range deleteList {
		if err := os.RemoveAll(object.target); err != nil {
			server.apiError(w, http.StatusInternalServerError, fmt.Sprintf("could not delete %v", object.name))
			return
		}

		deleted = append(deleted, object.name)
	}

	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}

func (server *Server) handleMove(w http.ResponseWriter, r *http.Request) {
	server.transfer(w, r, true)
}

func (server *Server) handleCopy(w http.ResponseWriter, r *http.Request) {
	server.transfer(w, r, false)
}

func (server *Server) destination(to string, count int, allowName bool) (string, string, error) {
	if strings.TrimSpace(to) == "" {
		return "", "", fmt.Errorf("enter a destination path")
	}

	if !allowName || strings.HasSuffix(to, "/") || count > 1 {
		dir, err := server.resolveUrlPath(to)
		return dir, "", err
	}

	cleaned := path.Clean(to)

	name, err := validateName(path.Base(cleaned))
	if err != nil {
		return "", "", errInvalidName
	}

	dir, err := server.resolveUrlPath(path.Dir(cleaned))

	return dir, name, err
}

func checkedNames(values []string) ([]string, error) {
	if len(values) == 0 {
		return nil, errInvalidName
	}

	names := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))

	for _, value := range values {
		name, err := validateName(value)
		if err != nil {
			return nil, err
		}

		if !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}

	return names, nil
}

func pathInside(parent string, target string) bool {
	relative, err := filepath.Rel(parent, target)
	if err != nil {
		return true
	}

	return relative != "." && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func copyPath(source string, target string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}

	if info.Mode()&os.ModeSymlink != 0 {
		link, err := os.Readlink(source)
		if err != nil {
			return err
		}

		return os.Symlink(link, target)
	}

	if !info.IsDir() {
		return copyFile(source, target, info.Mode().Perm())
	}

	if err := os.Mkdir(target, info.Mode().Perm()); err != nil {
		return err
	}

	entries, err := os.ReadDir(source)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if err := copyPath(filepath.Join(source, entry.Name()), filepath.Join(target, entry.Name())); err != nil {
			return err
		}
	}

	return nil
}

func copyFile(source string, target string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}

	if _, err := io.Copy(output, input); err != nil {
		output.Close()
		return err
	}

	return output.Close()
}

func (server *Server) checkWrite(w http.ResponseWriter, r *http.Request) bool {
	if !sameOrigin(r) {
		server.apiError(w, http.StatusForbidden, "cross-origin request blocked")
		return false
	}

	if !server.Config.writable() {
		server.apiError(w, http.StatusForbidden, "write access is disabled, run `next-index config -P <password>` on the server")
		return false
	}

	if !server.authenticated(r) {
		server.apiError(w, http.StatusUnauthorized, "sign in to manage files")
		return false
	}

	return true
}

func (server *Server) authenticated(r *http.Request) bool {
	if cookie, err := r.Cookie(sessionCookieName); err == nil && server.Sessions.valid(cookie.Value) {
		return true
	}

	if username, password, ok := r.BasicAuth(); ok {
		return server.checkCredentials(username, password)
	}

	return false
}

func (server *Server) checkCredentials(username string, password string) bool {
	if !server.Config.writable() {
		return false
	}

	usernameOK := subtle.ConstantTimeCompare([]byte(username), []byte(server.Config.Username)) == 1
	passwordOK := verifyPassword(server.Config.Password, password)

	return usernameOK && passwordOK
}

func (server *Server) setSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(sessionDuration.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || server.Config.TLS.Enable,
	})
}

func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}

	return strings.EqualFold(parsed.Host, r.Host) || allowedOrigin(origin)
}

func allowedOrigin(origin string) bool {
	return origin != "" &&
		config.AllowOrigin != "" &&
		strings.EqualFold(origin, config.AllowOrigin)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}

	return host
}

func decodeJSONBody(r *http.Request, target any) error {
	defer r.Body.Close()

	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))

	return decoder.Decode(target)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func (server *Server) apiError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
