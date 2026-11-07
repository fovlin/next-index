package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"acovia.net/record"
)

func (server *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if !server.Quiet {
		record.Info(
			r.Method,
			r.URL.RequestURI(),
			"from:",
			r.RemoteAddr,
		)
	}

	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		server.fail(w, r, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if strings.HasPrefix(r.URL.Path, "/@next-index/api/") || strings.HasPrefix(r.URL.Path, "/@next-index/assets/") {
		server.fail(w, r, http.StatusNotFound, "page not found")
		return
	}

	fsPath, err := server.resolveUrlPath(r.URL.Path)
	if err != nil {
		server.fail(w, r, http.StatusForbidden, "invalid path")
		return
	}

	info, err := os.Stat(fsPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			server.fail(w, r, http.StatusNotFound, "file or directory not found")
			return
		}

		record.Warn("stat", fsPath, ":", err)
		server.fail(w, r, http.StatusInternalServerError, "could not read the path")
		return
	}

	if info.IsDir() {
		list, err := server.buildListing(fsPath)
		if err != nil {
			record.Warn("list directory", fsPath, ":", err)
			server.fail(w, r, http.StatusInternalServerError, "could not read this directory")
			return
		}

		server.renderListing(w, r, list)
		return
	}

	server.serveFile(w, r, fsPath, info)
}

func (server *Server) fail(w http.ResponseWriter, r *http.Request, status int, message string) {
	if strings.HasPrefix(r.URL.Path, "/@next-index/api/") {
		server.apiError(w, status, message)
		return
	}

	writeErrorPage(w, status, message)
}

func (server *Server) failAPI(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, os.ErrNotExist):
		server.apiError(w, http.StatusNotFound, "path not found")

	case errors.Is(err, errInvalidPath), errors.Is(err, os.ErrPermission):
		server.apiError(w, http.StatusForbidden, "path is not accessible")

	case errors.Is(err, errNotDirectory):
		server.apiError(w, http.StatusBadRequest, "not a directory")

	default:
		server.apiError(w, http.StatusInternalServerError, fmt.Sprint(err))
	}
}
