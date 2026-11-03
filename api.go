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
	authenticated := server.authenticated(r)

	response := sessionResponse{
		Authenticated: authenticated,
		Writable:      server.config.writable(),
		Version:       version,
		MaxUploadMB:   server.config.MaxUploadMB,
	}

	if authenticated {
		response.Username = server.config.Username
	}

	writeJSON(w, http.StatusOK, response)
}

func (server *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		server.apiError(w, http.StatusForbidden, "cross-origin request blocked")
		return
	}

	if !server.config.writable() {
		server.apiError(w, http.StatusForbidden, "write access is disabled, run `next-index config -P <password>` on the server")
		return
	}

	key := clientIP(r)

	if !server.limiter.allow(key) {
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
		server.limiter.fail(key)
		server.apiError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	token, err := server.sessions.create()
	if err != nil {
		server.apiError(w, http.StatusInternalServerError, "could not create session")
		return
	}

	server.limiter.reset(key)
	server.setSessionCookie(w, r, token)

	writeJSON(w, http.StatusOK, sessionResponse{
		Authenticated: true,
		Username:      server.config.Username,
		Writable:      true,
		Version:       version,
		MaxUploadMB:   server.config.MaxUploadMB,
	})
}

func (server *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		server.apiError(w, http.StatusForbidden, "cross-origin request blocked")
		return
	}

	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		server.sessions.destroy(cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || server.config.TLS.Enable,
	})

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (server *Server) handleList(w http.ResponseWriter, r *http.Request) {
	urlPath := queryPath(r)

	if !strings.HasSuffix(urlPath, "/") {
		urlPath += "/"
	}

	list, err := server.buildListing(urlPath)
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

	dirPath, err := server.targetDir(queryPath(r))
	if err != nil {
		server.failAPI(w, err)
		return
	}

	if server.config.MaxUploadMB > 0 {
		limit := server.config.MaxUploadMB << 20
		r.Body = http.MaxBytesReader(w, r.Body, limit)
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		if r.MultipartForm != nil {
			r.MultipartForm.RemoveAll()
		}

		var maxBytesError *http.MaxBytesError

		switch true {
		case errors.As(err, &maxBytesError):
			server.apiError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("upload exceeds the %d MB limit", server.config.MaxUploadMB))
		default:
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

	server.fsMutex.Lock()
	defer server.fsMutex.Unlock()

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

	dirPath, err := server.targetDir(request.Path)
	if err != nil {
		server.failAPI(w, err)
		return
	}

	server.fsMutex.Lock()
	defer server.fsMutex.Unlock()

	target := filepath.Join(dirPath, name)

	if _, err := os.Lstat(target); err == nil {
		server.apiError(w, http.StatusConflict, "a file or directory with this name already exists")
		return
	} else if !os.IsNotExist(err) {
		server.apiError(w, http.StatusInternalServerError, "could not check the directory")
		return
	}

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

	dirPath, err := server.targetDir(request.Path)
	if err != nil {
		server.failAPI(w, err)
		return
	}

	server.fsMutex.Lock()
	defer server.fsMutex.Unlock()

	source := filepath.Join(dirPath, from)
	target := filepath.Join(dirPath, to)

	if _, err := os.Lstat(source); err != nil {
		if os.IsNotExist(err) {
			server.apiError(w, http.StatusNotFound, "the source file does not exist")
			return
		}

		server.apiError(w, http.StatusInternalServerError, "could not read the source file")
		return
	}

	if _, err := os.Lstat(target); err == nil {
		server.apiError(w, http.StatusConflict, "a file or directory with this name already exists")
		return
	}

	if err := os.Rename(source, target); err != nil {
		server.apiError(w, http.StatusInternalServerError, "could not rename the file")
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

	names := make([]string, 0, len(request.Names))
	seen := make(map[string]bool, len(request.Names))

	for _, rawName := range request.Names {
		name, err := validateName(rawName)
		if err != nil {
			server.apiError(w, http.StatusBadRequest, "invalid file name")
			return
		}

		if seen[name] {
			continue
		}

		seen[name] = true
		names = append(names, name)
	}

	dirPath, err := server.targetDir(request.Path)
	if err != nil {
		server.failAPI(w, err)
		return
	}

	server.fsMutex.Lock()
	defer server.fsMutex.Unlock()

	deleted := make([]string, 0, len(names))

	for _, name := range names {
		target := filepath.Join(dirPath, name)

		if err := os.RemoveAll(target); err != nil {
			server.apiError(w, http.StatusInternalServerError, fmt.Sprintf("could not delete %v", name))
			return
		}

		deleted = append(deleted, name)
	}

	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}

func (server *Server) checkWrite(w http.ResponseWriter, r *http.Request) bool {
	if !sameOrigin(r) {
		server.apiError(w, http.StatusForbidden, "cross-origin request blocked")
		return false
	}

	if !server.config.writable() {
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
	if cookie, err := r.Cookie(sessionCookieName); err == nil && server.sessions.valid(cookie.Value) {
		return true
	}

	if username, password, ok := r.BasicAuth(); ok {
		return server.checkCredentials(username, password)
	}

	return false
}

func (server *Server) checkCredentials(username string, password string) bool {
	if !server.config.writable() {
		return false
	}

	usernameOK := subtle.ConstantTimeCompare([]byte(username), []byte(server.config.Username)) == 1
	passwordOK := verifyPassword(server.config.Password, password)

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
		Secure:   r.TLS != nil || server.config.TLS.Enable,
	})
}

func (server *Server) targetDir(urlPath string) (string, error) {
	fsPath, err := server.resolve(urlPath)
	if err != nil {
		return "", err
	}

	if err := server.ensureReal(fsPath); err != nil {
		return "", err
	}

	info, err := os.Stat(fsPath)
	if err != nil {
		return "", err
	}

	if !info.IsDir() {
		return "", errNotDirectory
	}

	return fsPath, nil
}

func queryPath(r *http.Request) string {
	urlPath := r.URL.Query().Get("path")
	if urlPath == "" {
		urlPath = "/"
	}

	if !strings.HasPrefix(urlPath, "/") {
		urlPath = "/" + urlPath
	}

	return urlPath
}

func sameOrigin(r *http.Request) bool {
	if enbaleCrossOrigin {
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}

	return strings.EqualFold(parsed.Host, r.Host)
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
