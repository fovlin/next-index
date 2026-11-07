package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"
)

//go:embed web
var webAssets embed.FS

const contentSecurityPolicy = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'sha256-YVs+NSEzSoUDHGC1PBOg0jZ3AGEDLQ6/KKxqew7QH6E='; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

type pageData struct {
	Title     string
	Bootstrap template.JS
}

type bootstrapData struct {
	Title         string  `json:"title"`
	Site          string  `json:"site"`
	Path          string  `json:"path"`
	Parent        Entry   `json:"parent"`
	Crumbs        []Crumb `json:"crumbs"`
	Entries       []Entry `json:"entries"`
	Authenticated bool    `json:"authenticated"`
	Username      string  `json:"username,omitempty"`
	Writable      bool    `json:"writable"`
	Version       string  `json:"version"`
	MaxUploadMB   int64   `json:"maxUploadMB"`
	Now           int64   `json:"now"`
}

func (server *Server) renderListing(w http.ResponseWriter, r *http.Request, list *listing) {
	authenticated := server.authenticated(r)

	title := server.Config.Title
	if list.Path != "/" {
		title += " · " + strings.Trim(list.Path, "/")
	}

	data := bootstrapData{
		Title:         title,
		Site:          server.Config.Title,
		Path:          list.Path,
		Parent:        list.Parent,
		Crumbs:        list.Crumbs,
		Entries:       list.Entries,
		Authenticated: authenticated,
		Writable:      server.Config.writable(),
		Version:       version,
		MaxUploadMB:   server.Config.MaxUploadMB,
		Now:           time.Now().Unix(),
	}

	if authenticated {
		data.Username = server.Config.Username
	}

	bootstrap, err := json.Marshal(data)
	if err != nil {
		server.fail(w, r, http.StatusInternalServerError, "could not render this directory")
		return
	}

	page := pageData{
		Title:     title,
		Bootstrap: template.JS(bootstrap),
	}

	var buffer bytes.Buffer
	if err := server.Template.ExecuteTemplate(&buffer, "index.html", page); err != nil {
		server.fail(w, r, http.StatusInternalServerError, "could not render this directory")
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
	w.WriteHeader(http.StatusOK)
	w.Write(buffer.Bytes())
}

const errorPageTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{status}} · NEXT_INDEX</title>
<link rel="icon" href="/@next-index/assets/favicon.ico?v=16">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121212;color:#e8e8e8;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","Noto Sans SC",sans-serif;padding:24px}
.card{max-width:420px;width:100%;text-align:center;background:#171717;border:1px solid #2c2c2c;border-radius:8px;padding:40px 32px}
.code{color:#6cb0e0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:44px;font-weight:600}
h1{font-size:16px;margin:6px 0 8px;font-weight:600}
p{color:#a0a0a0;font-size:13px;line-height:1.6;margin:0 0 22px}
a{display:inline-block;padding:8px 14px;border-radius:6px;background:#004f8f;color:#fff;text-decoration:none;font-size:13px}
a:hover{background:#003f73}
</style>
</head>
<body>
<main class="card">
<div class="code">{{status}}</div>
<h1>{{title}}</h1>
<p>{{message}}</p>
<a href="/">Back to root</a>
</main>
</body>
</html>
`

func writeErrorPage(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)

	replacer := strings.NewReplacer(
		"{{status}}", strconv.Itoa(status),
		"{{title}}", html.EscapeString(http.StatusText(status)),
		"{{message}}", html.EscapeString(message),
	)

	fmt.Fprint(w, replacer.Replace(errorPageTemplate))
}
