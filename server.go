package main

import (
	"context"
	"errors"
	"fmt"
	"html/template"
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

type Server struct {
	Config   Config
	Root     string
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

	return &Server{
		Config:   cfg,
		Root:     root,
		Sessions: newSessionStore(sessionDuration),
		Limiter:  newLoginLimiter(5, 5*time.Minute),
		Template: pageTemplate,
		Quiet:    quietFlag,
	}, nil
}

func (server *Server) handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /@next-index/assets/", server.serveAsset)
	mux.HandleFunc("GET /favicon.ico", server.serveAsset)

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
		start := time.Now()

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

			w.Header().Set("SameSite", "None")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		recorder := &statusRecorder{
			ResponseWriter: w,
			status:         http.StatusOK,
		}

		defer func() {
			if value := recover(); value != nil {
				record.Error("panic while serving", r.URL.Path, ":", value)
				record.Error(string(debug.Stack()))
				http.Error(recorder, "internal server error", http.StatusInternalServerError)
			}

			if !server.Quiet {
				record.Info(
					r.Method,
					r.URL.RequestURI(),
					recorder.status,
					time.Since(start).Round(time.Microsecond),
				)
			}
		}()

		next.ServeHTTP(recorder, r)
	})
}

func (server *Server) serveAsset(w http.ResponseWriter, r *http.Request) {
	name := path.Join("web", strings.TrimPrefix(r.URL.Path, "/@next-index/assets/"))

	data, err := webAssets.ReadFile(name)

	if err != nil {
		server.fail(w, r, http.StatusNotFound, "asset not found")
		return
	}

	w.Header().Set("Content-Type", mime.TypeByExtension(path.Ext(name)))
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(data)
}

func (server *Server) resolveUrlPath(urlPath string) (string, error) {
	cleaned := path.Clean("/" + strings.TrimPrefix(urlPath, "/"))
	fsPath := filepath.Join(server.Root, filepath.FromSlash(cleaned))

	relative, err := filepath.Rel(server.Root, fsPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errInvalidPath
	}

	record.Debug(fsPath)
	return fsPath, nil
}

// urlPath is the inverse of resolveUrlPath. Directories keep a trailing slash.
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

func (server *Server) listenAndServe() error {
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

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (recorder *statusRecorder) WriteHeader(status int) {
	recorder.status = status
	recorder.ResponseWriter.WriteHeader(status)
}

func (recorder *statusRecorder) Unwrap() http.ResponseWriter {
	return recorder.ResponseWriter
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

	for _, name := range names {
		source := filepath.Join(fromDir, name)
		target := filepath.Join(toDir, name)

		if toName != "" {
			target = filepath.Join(toDir, toName)
		}

		info, err := os.Lstat(source)
		if err != nil {
			server.failAPI(w, err)
			return
		}

		if _, err := os.Lstat(target); err == nil {
			server.apiError(w, http.StatusConflict, "a file or directory with this name already exists")
			return
		}

		if info.IsDir() && pathInside(source, target) {
			server.apiError(w, http.StatusBadRequest, "cannot "+action+" a folder into itself")
			return
		}

		if move {
			err = os.Rename(source, target)
		} else {
			err = copyPath(source, target)
		}

		if err != nil {
			server.apiError(w, http.StatusInternalServerError, "could not "+action+" "+name+": "+err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"names": names, "to": request.To})
}
