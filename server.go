package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"acovia.net/record"
)

type asset struct {
	body        []byte
	gzipped     []byte
	contentType string
}

type Server struct {
	Config   Config
	Root     string
	Assets   map[string]asset
	Sessions *sessionStore
	Limiter  *loginLimiter
	Template *template.Template
	FsMutex  sync.Mutex
	Quiet    bool
}

func newServer(cfg Config, root string) (*Server, error) {
	pageTemplate, err := template.ParseFS(webAssets, "web/index.html")
	if err != nil {
		return nil, fmt.Errorf("parse page template: %w", err)
	}

	assets, err := loadAssets()
	if err != nil {
		return nil, fmt.Errorf("load assets: %w", err)
	}

	return &Server{
		Config:   cfg,
		Assets:   assets,
		Root:     root,
		Sessions: newSessionStore(sessionDuration),
		Limiter:  newLoginLimiter(5, 5*time.Minute),
		Template: pageTemplate,
		Quiet:    quietFlag,
	}, nil
}

const loginPath = "/@next-index/login"

func (server *Server) loginRequired(r *http.Request) bool {
	return server.Config.ForceLogin && !server.authenticated(r)
}

func (server *Server) handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /@next-index/assets/", server.serveAsset)
	mux.HandleFunc("GET /favicon.ico", server.serveAsset)

	mux.HandleFunc("GET "+loginPath, server.handleLoginPage)
	mux.HandleFunc("GET /@next-index/api/session", server.handleSession)
	mux.HandleFunc("POST /@next-index/api/login", server.handleLogin)
	mux.HandleFunc("POST /@next-index/api/logout", server.handleLogout)
	mux.HandleFunc("GET /@next-index/api/list", server.handleList)
	mux.HandleFunc("POST /@next-index/api/upload", server.handleUpload)
	mux.HandleFunc("POST /@next-index/api/mkdir", server.handleMkdir)
	mux.HandleFunc("POST /@next-index/api/rename", server.handleRename)
	mux.HandleFunc("POST /@next-index/api/move", server.handleMove)
	mux.HandleFunc("POST /@next-index/api/copy", server.handleCopy)
	mux.HandleFunc("POST /@next-index/api/delete", server.handleDelete)

	mux.HandleFunc("/@next-index/api/", func(w http.ResponseWriter, r *http.Request) {
		server.apiError(w, http.StatusNotFound, "not found")
	})

	mux.HandleFunc("/", server.handleRoot)

	return server.wrap(mux)
}

func (server *Server) wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")

		origin := r.Header.Get("Origin")
		allowed := allowedOrigin(origin)

		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", config.AllowOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions && origin != "" {
			if !allowed {
				http.Error(w, "cross-origin request blocked", http.StatusForbidden)
				return
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		defer func() {
			if value := recover(); value != nil {
				record.Error("panic while serving", r.URL.Path, ":", value)
				record.Error(string(debug.Stack()))
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()

		next.ServeHTTP(w, r)

		if server.loggable(r.URL.Path) {
			record.Info(r.Method, r.URL.RequestURI(), "from:", r.RemoteAddr)
		}
	})
}

func (server *Server) loggable(urlPath string) bool {
	return !server.Quiet && !strings.HasPrefix(urlPath, "/@next-index/assets/") && urlPath != "/favicon.ico"
}

func (server *Server) serveAsset(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/@next-index/assets/"), "/")

	item, ok := server.Assets[name]

	if !ok {
		server.fail(w, r, http.StatusNotFound, "asset not found")
		return
	}

	w.Header().Set("Content-Type", item.contentType)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Add("Vary", "Accept-Encoding")

	if item.gzipped == nil || !acceptsGzip(r.Header.Get("Accept-Encoding")) {
		w.Write(item.body)
		return
	}

	w.Header().Set("Content-Encoding", "gzip")
	w.Write(item.gzipped)
}

func loadAssets() (map[string]asset, error) {
	items := make(map[string]asset)

	err := fs.WalkDir(webAssets, "web", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}

		body, err := webAssets.ReadFile(name)
		if err != nil {
			return err
		}

		item := asset{
			body:        body,
			contentType: mime.TypeByExtension(path.Ext(name)),
		}

		if compressible(path.Ext(name)) {
			var buffer bytes.Buffer
			writer := gzip.NewWriter(&buffer)

			if _, err := writer.Write(body); err != nil {
				return err
			}

			if err := writer.Close(); err != nil {
				return err
			}

			item.gzipped = buffer.Bytes()
		}

		items[strings.TrimPrefix(name, "web/")] = item

		return nil
	})

	return items, err
}

func compressible(extension string) bool {
	switch strings.ToLower(extension) {
	case ".css", ".html", ".js", ".json", ".svg", ".txt":
		return true
	}

	return false
}

func acceptsGzip(header string) bool {
	for _, value := range strings.Split(header, ",") {
		fields := strings.Split(strings.TrimSpace(value), ";")

		if strings.TrimSpace(fields[0]) != "gzip" {
			continue
		}

		for _, parameter := range fields[1:] {
			if strings.TrimSpace(parameter) == "q=0" {
				return false
			}
		}

		return true
	}

	return false
}

func (server *Server) resolveUrlPath(urlPath string) (string, error) {
	cleaned := path.Clean("/" + strings.TrimPrefix(urlPath, "/"))
	fsPath := filepath.Join(server.Root, filepath.FromSlash(cleaned))

	relative, err := filepath.Rel(server.Root, fsPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errInvalidPath
	}

	return fsPath, nil
}

func (server *Server) urlPath(fsPath string, isDir bool) string {
	relative, err := filepath.Rel(server.Root, fsPath)
	if err != nil || relative == "." {
		return "/"
	}

	urlPath := "/" + filepath.ToSlash(relative)
	if isDir && !strings.HasSuffix(urlPath, "/") {
		urlPath += "/"
	}

	return urlPath
}

func (server *Server) run() error {
	address := net.JoinHostPort(server.Config.Addr, strconv.Itoa(server.Config.Port))

	httpServer := &http.Server{
		Addr:              address,
		Handler:           server.handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errChan := make(chan error, 1)

	go func() {
		if server.Config.TLS.Enable {
			errChan <- httpServer.ListenAndServeTLS(server.Config.TLS.Cert, server.Config.TLS.Key)
			return
		}

		errChan <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errChan:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err

	case <-ctx.Done():
		record.Info("shutting down")
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownContext)
	}
}

func (server *Server) transfer(w http.ResponseWriter, r *http.Request, move bool) {
	if !server.checkWrite(w, r) {
		return
	}

	var request requestPath

	if err := decodeJSONBody(r, &request); err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	names, err := checkedNames(request.Names)
	if err != nil {
		server.apiError(w, http.StatusBadRequest, "invalid file name")
		return
	}

	fromDir, err := server.resolveUrlPath(request.Path)
	if err != nil {
		server.failAPI(w, err)
		return
	}

	toDir, toName, err := server.destination(request.To, len(names), !move)
	if err != nil {
		server.apiError(w, http.StatusBadRequest, err.Error())
		return
	}

	info, err := os.Stat(toDir)
	if err != nil {
		server.failAPI(w, err)
		return
	}

	if !info.IsDir() {
		server.apiError(w, http.StatusBadRequest, "destination is not a folder")
		return
	}

	action := "copy"
	if move {
		action = "move"
	}

	server.FsMutex.Lock()
	defer server.FsMutex.Unlock()

	type targetObject struct {
		name   string
		source string
		target string
	}

	var transferList []targetObject

	for _, name := range names {
		source := filepath.Join(fromDir, name)
		target := filepath.Join(toDir, name)

		if toName != "" {
			target = filepath.Join(toDir, toName)
		}

		sourceInfo, err := os.Lstat(source)
		if err != nil {
			server.failAPI(w, err)
			return
		}

		if _, err := os.Lstat(target); err == nil {
			server.apiError(w, http.StatusConflict, "a file or directory with this name already exists")
			return
		}

		if sourceInfo.IsDir() && pathInside(source, target) {
			server.apiError(w, http.StatusBadRequest, "cannot "+action+" a folder into itself")
			return
		}
		transferList = append(transferList, targetObject{
			name:   name,
			source: source,
			target: target,
		})
	}

	for _, object := range transferList {
		if move {
			err = os.Rename(object.source, object.target)
		} else {
			err = copyPath(object.source, object.target)
		}

		if err != nil {
			server.apiError(w, http.StatusInternalServerError, "could not "+action+" "+object.name+": "+err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"names": names, "to": request.To})
}
