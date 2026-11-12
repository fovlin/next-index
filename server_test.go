package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testPassword = "correct horse battery staple"

type testEnv struct {
	t      *testing.T
	server *Server
	http   *httptest.Server
	root   string
}

func newTestEnv(t *testing.T, cfg Config) *testEnv {
	t.Helper()

	if cfg.Username == "" {
		cfg.Username = "admin"
	}

	if cfg.Password == "" {
		cfg.Password = hashPassword(testPassword)
	}

	if cfg.MaxUploadMB == 0 {
		cfg.MaxUploadMB = 8
	}

	root := t.TempDir()

	server, err := newServer(cfg, root)
	if err != nil {
		t.Fatalf("newServer: %v", err)
	}

	server.Quiet = true

	ts := httptest.NewServer(server.handler())
	t.Cleanup(ts.Close)

	return &testEnv{t: t, server: server, http: ts, root: root}
}

func (env *testEnv) seed(name, content string) {
	env.t.Helper()

	full := filepath.Join(env.root, filepath.FromSlash(name))

	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		env.t.Fatalf("seed dir: %v", err)
	}

	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		env.t.Fatalf("seed file: %v", err)
	}
}

func (env *testEnv) exists(name string) bool {
	env.t.Helper()

	_, err := os.Stat(filepath.Join(env.root, filepath.FromSlash(name)))

	return err == nil
}

func (env *testEnv) do(req *http.Request) *http.Response {
	env.t.Helper()

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		env.t.Fatalf("%s %s: %v", req.Method, req.URL.Path, err)
	}

	env.t.Cleanup(func() { resp.Body.Close() })

	return resp
}

func (env *testEnv) get(path string, cookie *http.Cookie) *http.Response {
	env.t.Helper()

	req, err := http.NewRequest(http.MethodGet, env.http.URL+path, nil)
	if err != nil {
		env.t.Fatal(err)
	}

	if cookie != nil {
		req.AddCookie(cookie)
	}

	return env.do(req)
}

func (env *testEnv) postJSON(path string, body any, cookie *http.Cookie) *http.Response {
	env.t.Helper()

	payload, err := json.Marshal(body)
	if err != nil {
		env.t.Fatal(err)
	}

	req, err := http.NewRequest(http.MethodPost, env.http.URL+path, bytes.NewReader(payload))
	if err != nil {
		env.t.Fatal(err)
	}

	req.Header.Set("Content-Type", "application/json")

	if cookie != nil {
		req.AddCookie(cookie)
	}

	return env.do(req)
}

func (env *testEnv) upload(dir, name string, data []byte, overwrite bool, cookie *http.Cookie) *http.Response {
	env.t.Helper()

	var body bytes.Buffer

	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		env.t.Fatal(err)
	}

	if _, err := part.Write(data); err != nil {
		env.t.Fatal(err)
	}

	if err := writer.Close(); err != nil {
		env.t.Fatal(err)
	}

	target := env.http.URL + "/@next-index/api/upload?path=" + url.QueryEscape(dir)

	if overwrite {
		target += "&overwrite=1"
	}

	req, err := http.NewRequest(http.MethodPost, target, &body)
	if err != nil {
		env.t.Fatal(err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())

	if cookie != nil {
		req.AddCookie(cookie)
	}

	return env.do(req)
}

func (env *testEnv) login() *http.Cookie {
	env.t.Helper()

	resp := env.postJSON("/@next-index/api/login", map[string]string{
		"username": "admin",
		"password": testPassword,
	}, nil)

	if resp.StatusCode != http.StatusOK {
		env.t.Fatalf("login status = %d, want 200", resp.StatusCode)
	}

	cookies := resp.Cookies()
	if len(cookies) == 0 {
		env.t.Fatal("login returned no cookie")
	}

	return cookies[0]
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	return string(body)
}

func TestListingShowsEntries(t *testing.T) {
	env := newTestEnv(t, Config{})

	env.seed("a.txt", "alpha")
	env.seed("sub/b.txt", "beta")

	resp := env.get("/", nil)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	body := readBody(t, resp)

	for _, want := range []string{"a.txt", "sub"} {
		if !strings.Contains(body, want) {
			t.Errorf("page does not mention %q", want)
		}
	}
}

func TestMissingFileIs404(t *testing.T) {
	env := newTestEnv(t, Config{})

	if resp := env.get("/nope.txt", nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestFileDownloadAndRange(t *testing.T) {
	env := newTestEnv(t, Config{})

	env.seed("a.txt", "hello world")

	resp := env.get("/a.txt?download=1", nil)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	if disposition := resp.Header.Get("Content-Disposition"); !strings.Contains(disposition, "attachment") {
		t.Errorf("Content-Disposition = %q, want attachment", disposition)
	}

	req, err := http.NewRequest(http.MethodGet, env.http.URL+"/a.txt", nil)
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Range", "bytes=0-4")

	partial := env.do(req)

	if partial.StatusCode != http.StatusPartialContent {
		t.Fatalf("range status = %d, want 206", partial.StatusCode)
	}

	if got := readBody(t, partial); got != "hello" {
		t.Errorf("range body = %q, want %q", got, "hello")
	}
}

func TestLoginProtectsTheAPI(t *testing.T) {
	env := newTestEnv(t, Config{})

	env.seed("a.txt", "alpha")

	// Browsing is public by design; writing needs a session.
	if resp := env.get("/@next-index/api/list?path=/", nil); resp.StatusCode != http.StatusOK {
		t.Fatalf("anonymous list status = %d, want 200", resp.StatusCode)
	}

	if resp := env.postJSON("/@next-index/api/mkdir", map[string]string{"path": "/", "name": "nope"}, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous mkdir status = %d, want 401", resp.StatusCode)
	}

	resp := env.postJSON("/@next-index/api/login", map[string]string{
		"username": "admin",
		"password": "wrong",
	}, nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("bad login status = %d, want 401", resp.StatusCode)
	}

	cookie := env.login()

	resp = env.get("/@next-index/api/list?path=/", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("signed-in list status = %d, want 200", resp.StatusCode)
	}

	if body := readBody(t, resp); !strings.Contains(body, "a.txt") {
		t.Errorf("list body does not mention a.txt")
	}
}

func TestWriteFlow(t *testing.T) {
	env := newTestEnv(t, Config{})

	env.seed("keep.txt", "keep me")

	cookie := env.login()

	resp := env.postJSON("/@next-index/api/mkdir", map[string]string{"path": "/", "name": "docs"}, cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("mkdir status = %d, want 200", resp.StatusCode)
	}

	if !env.exists("docs") {
		t.Fatal("docs was not created")
	}

	if resp := env.postJSON("/@next-index/api/mkdir", map[string]string{"path": "/", "name": "docs"}, cookie); resp.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate mkdir status = %d, want 409", resp.StatusCode)
	}

	if resp := env.upload("/docs", "uploaded.txt", []byte("payload"), false, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("upload status = %d, want 200", resp.StatusCode)
	}

	if !env.exists("docs/uploaded.txt") {
		t.Fatal("uploaded.txt was not written")
	}

	if resp := env.postJSON("/@next-index/api/rename", map[string]string{"path": "/docs", "from": "uploaded.txt", "to": "renamed.txt"}, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("rename status = %d, want 200", resp.StatusCode)
	}

	if !env.exists("docs/renamed.txt") || env.exists("docs/uploaded.txt") {
		t.Fatal("rename did not move the file")
	}

	if resp := env.postJSON("/@next-index/api/copy", map[string]any{"path": "/docs", "names": []string{"renamed.txt"}, "to": "/"}, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("copy status = %d, want 200", resp.StatusCode)
	}

	if !env.exists("renamed.txt") || !env.exists("docs/renamed.txt") {
		t.Fatal("copy did not create the second file")
	}

	if resp := env.postJSON("/@next-index/api/delete", map[string]any{"path": "/", "names": []string{"renamed.txt"}}, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("delete root copy status = %d, want 200", resp.StatusCode)
	}

	if resp := env.postJSON("/@next-index/api/move", map[string]any{"path": "/docs", "names": []string{"renamed.txt"}, "to": "/"}, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("move status = %d, want 200", resp.StatusCode)
	}

	if env.exists("docs/renamed.txt") || !env.exists("renamed.txt") {
		t.Fatal("move did not relocate the file")
	}

	if resp := env.postJSON("/@next-index/api/delete", map[string]any{"path": "/", "names": []string{"renamed.txt"}}, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("delete status = %d, want 200", resp.StatusCode)
	}

	if env.exists("renamed.txt") {
		t.Fatal("delete did not remove the file")
	}
}

func TestUploadLimit(t *testing.T) {
	env := newTestEnv(t, Config{MaxUploadMB: 1})

	cookie := env.login()

	small := bytes.Repeat([]byte("a"), 1024)
	if resp := env.upload("/", "small.bin", small, false, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("small upload status = %d, want 200", resp.StatusCode)
	}

	large := bytes.Repeat([]byte("a"), 2<<20)
	if resp := env.upload("/", "large.bin", large, false, cookie); resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("large upload status = %d, want 413", resp.StatusCode)
	}

	if env.exists("large.bin") {
		t.Fatal("oversized upload reached the disk")
	}
}

func TestFolderZip(t *testing.T) {
	env := newTestEnv(t, Config{})

	env.seed("top.txt", "top")
	env.seed("sub/a.txt", "alpha")
	env.seed("sub/b.txt", "beta")

	if resp := env.get("/sub/?download=1", nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous zip status = %d, want 401", resp.StatusCode)
	}

	cookie := env.login()

	resp := env.get("/sub/?download=1", cookie)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("zip status = %d, want 200", resp.StatusCode)
	}

	if disposition := resp.Header.Get("Content-Disposition"); !strings.Contains(disposition, "sub.zip") {
		t.Errorf("Content-Disposition = %q, want sub.zip", disposition)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read zip: %v", err)
	}

	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("zip.NewReader: %v", err)
	}

	names := make([]string, 0, len(reader.File))
	for _, file := range reader.File {
		names = append(names, file.Name)

		if strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "..") {
			t.Errorf("zip entry escapes the folder: %q", file.Name)
		}
	}

	if strings.Join(names, ",") != "a.txt,b.txt" {
		t.Errorf("zip entries = %v, want [a.txt b.txt]", names)
	}

	root := env.get("/?download=1", cookie)

	if disposition := root.Header.Get("Content-Disposition"); !strings.Contains(disposition, "root.zip") {
		t.Errorf("root Content-Disposition = %q, want root.zip", disposition)
	}
}

func TestForceLoginNeedsASession(t *testing.T) {
	env := newTestEnv(t, Config{ForceLogin: true})

	if resp := env.get("/@next-index/api/list?path=/", nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous list status = %d, want 401", resp.StatusCode)
	}

	cookie := env.login()

	if resp := env.get("/@next-index/api/list?path=/", cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("signed-in list status = %d, want 200", resp.StatusCode)
	}
}

func TestInvalidNamesAreRejected(t *testing.T) {
	env := newTestEnv(t, Config{})

	cookie := env.login()

	for _, name := range []string{"..", ".", "a/b", "a\\b", ""} {
		if resp := env.postJSON("/@next-index/api/mkdir", map[string]string{"path": "/", "name": name}, cookie); resp.StatusCode != http.StatusBadRequest {
			t.Errorf("mkdir %q status = %d, want 400", name, resp.StatusCode)
		}
	}
}

func TestPathStaysInsideRoot(t *testing.T) {
	env := newTestEnv(t, Config{})

	env.seed("inside.txt", "inside")

	cookie := env.login()

	// The path is cleaned before it is joined to the root, so a traversal
	// simply points at a folder that does not exist inside it.
	resp := env.get("/@next-index/api/list?path="+url.QueryEscape("../../etc"), cookie)
	if resp.StatusCode != http.StatusNotFound && resp.StatusCode != http.StatusOK {
		t.Fatalf("traversal list status = %d, want 200 or 404", resp.StatusCode)
	}

	if body := readBody(t, resp); strings.Contains(body, "passwd") {
		t.Errorf("listing leaked outside the root: %s", body)
	}

	if resp := env.get("/../server_test.go", nil); resp.StatusCode == http.StatusOK {
		t.Errorf("file outside the root was served")
	}
}

func TestPasswordHashing(t *testing.T) {
	encoded := hashPassword("hunter2")

	if !validPasswordHash(encoded) {
		t.Fatalf("hashPassword produced an invalid hash: %q", encoded)
	}

	if !verifyPassword(encoded, "hunter2") {
		t.Error("verifyPassword rejected the right password")
	}

	if verifyPassword(encoded, "hunter3") {
		t.Error("verifyPassword accepted the wrong password")
	}

	if verifyPassword("not-hex", "hunter2") {
		t.Error("verifyPassword accepted a malformed hash")
	}
}

func TestUnknownAPIIs404(t *testing.T) {
	env := newTestEnv(t, Config{})

	if resp := env.get("/@next-index/api/nope", nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("GET status = %d, want 404", resp.StatusCode)
	}

	if resp := env.postJSON("/@next-index/api/nope", map[string]string{}, nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("POST status = %d, want 404", resp.StatusCode)
	}
}

func TestUploadRenamesAndOverwrites(t *testing.T) {
	env := newTestEnv(t, Config{})

	cookie := env.login()

	if resp := env.upload("/", "a.txt", []byte("first"), false, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("first upload status = %d, want 200", resp.StatusCode)
	}

	if resp := env.upload("/", "a.txt", []byte("second"), false, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("second upload status = %d, want 200", resp.StatusCode)
	}

	if !env.exists("a.txt") || !env.exists("a-1.txt") {
		t.Fatal("duplicate upload did not get a free name")
	}

	if got := env.read("a.txt"); got != "first" {
		t.Errorf("a.txt = %q, want %q", got, "first")
	}

	if resp := env.upload("/", "a.txt", []byte("replaced"), true, cookie); resp.StatusCode != http.StatusOK {
		t.Fatalf("overwrite status = %d, want 200", resp.StatusCode)
	}

	if got := env.read("a.txt"); got != "replaced" {
		t.Errorf("a.txt after overwrite = %q, want %q", got, "replaced")
	}

	if !env.exists("a-1.txt") {
		t.Error("overwrite removed the sibling that was renamed earlier")
	}
}

func (env *testEnv) read(name string) string {
	env.t.Helper()

	body, err := os.ReadFile(filepath.Join(env.root, filepath.FromSlash(name)))
	if err != nil {
		env.t.Fatalf("read %s: %v", name, err)
	}

	return string(body)
}
