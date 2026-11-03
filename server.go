package main

import (
	"context"
	"errors"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strconv"
	"sync"
	"syscall"
	"time"

	"acovia.net/record"
)

type Server struct {
	config   Config
	root     string
	sessions *sessionStore
	limiter  *loginLimiter
	template *template.Template
	fsMutex  sync.Mutex
	quiet    bool
}

func newServer(cfg Config, root string) (*Server, error) {
	pageTemplate, err := template.ParseFS(webAssets, "web/index.html")
	if err != nil {
		return nil, fmt.Errorf("parse page template: %w", err)
	}

	return &Server{
		config:   cfg,
		root:     root,
		sessions: newSessionStore(sessionDuration),
		limiter:  newLoginLimiter(5, 5*time.Minute),
		template: pageTemplate,
		quiet:    quietFlag,
	}, nil
}

func (server *Server) handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /@next-index/assets/style.css", server.serveAsset("style.css", "text/css; charset=utf-8"))
	mux.HandleFunc("GET /@next-index/assets/app.js", server.serveAsset("app.js", "text/javascript; charset=utf-8"))
	mux.HandleFunc("GET /@next-index/assets/favicon.svg", server.serveAsset("favicon.svg", "image/svg+xml"))
	mux.HandleFunc("GET /@next-index/assets/favicon.ico", server.serveAsset("favicon.ico", "image/x-icon"))
	mux.HandleFunc("GET /favicon.ico", server.serveAsset("favicon.ico", "image/x-icon"))

	mux.HandleFunc("GET /@next-index/api/session", server.handleSession)
	mux.HandleFunc("POST /@next-index/api/login", server.handleLogin)
	mux.HandleFunc("POST /@next-index/api/logout", server.handleLogout)
	mux.HandleFunc("GET /@next-index/api/list", server.handleList)
	mux.HandleFunc("POST /@next-index/api/upload", server.handleUpload)
	mux.HandleFunc("POST /@next-index/api/mkdir", server.handleMkdir)
	mux.HandleFunc("POST /@next-index/api/rename", server.handleRename)
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
				record.ErrorNoExit("panic while serving", r.URL.Path, ":", value)
				record.ErrorNoExit(string(debug.Stack()))
				http.Error(recorder, "internal server error", http.StatusInternalServerError)
			}

			if !server.quiet {
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

func (server *Server) serveAsset(name string, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := webAssets.ReadFile(filepath.Join("web", name))
		if err != nil {
			server.fail(w, r, http.StatusNotFound, "asset not found")
			return
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(data)
	}
}

func (server *Server) listenAndServe() error {
	address := net.JoinHostPort(server.config.Addr, strconv.Itoa(server.config.Port))

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
		if server.config.TLS.Enable {
			errChan <- httpServer.ListenAndServeTLS(server.config.TLS.Cert, server.config.TLS.Key)
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
