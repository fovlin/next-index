# Develop docs

## Contributing policy

- AI-generated code is accepted, but generating the whole project with AI is not allowed.

## Layout

```text
next-index
├── main.go            entry point, flag parsing, command table, help text
├── serve.go           run command: root resolution and listen
├── config.go          ~/.next_index.json: defaults, load, atomic save
├── server.go          Server type, routes, middleware, graceful shutdown
├── handler.go         page and file handler, error responses
├── listing.go         path containment, directory entries, upload saving, names
├── api.go             JSON API, sessions, credentials, write checks
├── view.go            page template, bootstrap JSON, embedded assets, error page
├── web/               index.html, favicon.svg, app.js, main.css
├── opt/               vendored option parser, module acovia.net/opt
├── record/            vendored logging helpers, module acovia.net/record
├── build.sh           cross-compile the release targets
├── CHANGELOG.md       release history
├── README.md          user documentation
└── DEVELOP.md         this file
```

Build and run from the repository root:

```bash
go build .
./next-index ~/Downloads
```

## Request flow

```text
next-index [command] [options] [root]
        │
        ├── initProgram   opt.Parse, then cmdMap lookup
        ├── loadConfig    read ~/.next_index.json, fill defaults and credentials
        ├── parseFlag     override config from -i/-p/-r/-u/-P/-o
        └── run / config
                          run:    resolveRoot
                                  → save if new/credentials generated
                                  → newServer → listenAndServe
                          config: save if flags/credentials generated (silent)
```

`main` dispatches through `cmdMap`. With no command, or when the first argument
is an existing directory or looks like a path (`/`, `./`, `~/`, contains a
separator), it selects `run` with that directory. Anything else is an unknown
command.

`parseFlag` runs after `loadConfig` and writes any non-empty `-i`, `-p`, `-r`,
`-u`, `-P` or `-o` value directly into the config struct, setting
`configChanged`. `run` resolves the root from the positional argument, then the
config, then the current directory. It saves the config on first use and when
credentials had to be generated; otherwise its flags stay in memory. `config`
saves flag overrides (and generated credentials) silently; without flags it
prints a complete existing config, and a missing config or missing credentials
are created or repaired silently.

## Server

`Server.handler` registers the routes on a `http.ServeMux`:

```text
GET  /@next-index/assets/<any.css|js|svg|ico>              embedded assets
GET  /@next-index/api/session                             login state
POST /@next-index/api/login, /@next-index/api/logout                  session handling
GET  /@next-index/api/list                                directory entries as JSON
POST /@next-index/api/upload, /@next-index/api/mkdir, /@next-index/api/rename,
     /@next-index/api/delete                              write endpoints
GET  / and /<path>                            page or file
```

`Server.wrap` sets the security headers, records the status for the access log
and recovers panics. Every request is logged with `record.Info` unless `--quiet`
is set.

It also handles CORS. When the request `Origin` exactly matches
`config.AllowOrigin`, it adds `Access-Control-Allow-Origin`,
`Access-Control-Allow-Credentials` and `Vary: Origin`; an `OPTIONS` preflight
returns `204` with `GET, POST, OPTIONS` and `Content-Type, Authorization`.
Preflights from other origins get `403`.

`handleRoot` resolves the URL path, checks that it is still inside the root,
then either renders a listing (directories, with a redirect to add the
trailing slash) or streams the file with `http.ServeContent`, which gives range
requests and conditional requests for free.

## Path safety

`resolveUrlPath` joins the cleaned URL path onto the root and verifies with
`filepath.Rel` that the result stays inside it, which refuses `..` traversal.

Symlinks are intentionally not resolved: a link inside the root is followed
wherever it points, including outside the root. That keeps the served tree
"what you see is what you get" and lets people link shared storage into it, but
it also means a link to `~/.ssh` would be readable by anyone who can read the
listing. Only serve a directory whose contents you control.

Write handlers resolve their target directory the same way. File names from
uploads go through `sanitizeName` (base name, control characters removed,
reserved Windows names prefixed); names typed by the user go through
`validateName`, which rejects separators, `..`, control characters and reserved
names outright.

## Configuration

`Config` is a plain struct serialized with `encoding/json`. `saveConfig` writes
to a temporary file in the same directory, `chmod 0600`, then renames it over
the config, so a crash cannot leave a truncated file.

`loadConfig` reads the file (or `defaultConfig()` when missing), fills missing
defaults, then calls `initUser`: it fills an empty username with `admin` (or the
`-u` value) and generates a password only when the config has none and `-P` was
not given. It never writes. `run` saves when the file is new or credentials were
generated; `config` also saves when `configChanged` is set. Later `run` flags
stay in memory.

`needSaveConfig` tracks a new file, filled defaults or generated credentials;
`configChanged` tracks flag overrides. `run` saves only the former, while
`config` saves either. `-o/--cross-origin` stores an exact `Origin` in
`allow_origin`; the same value is used by `sameOrigin`, the CORS headers and the
preflight response.

`max_upload_mb` is applied with `http.MaxBytesReader` before
`ParseMultipartForm`; `0` disables the limit. Each uploaded file is streamed into
a `.next_index-upload-*` temporary file in the target directory and renamed into
place, so a failed upload never leaves a partial file.

## Auth

- `hashPassword` returns the hex SHA-256 digest of the password.
- `verifyPassword` decodes the hex digest and compares it with
  `subtle.ConstantTimeCompare`.
- The digest is intentionally unsalted: simple, but only suitable for a
  single-user tool with a long password.
- `sessionStore` keeps random 256-bit tokens in memory for 12 hours. Sessions are
  lost on restart, which is fine for a single-user file server.
- `loginLimiter` blocks one address for five minutes after five failures.
- Write endpoints accept the session cookie or HTTP Basic auth. `checkWrite`
  also enforces same-origin `Origin` headers, so a page on another site cannot
  reuse a logged-in browser session unless its exact Origin is listed in
  `allow_origin`.
- Cross-site cookies stay `SameSite=Lax`; cross-origin writes need Basic auth or
  a deliberate cookie-policy change.

## Frontend

`web/app.js` and `web/main.css` are the front end. They are written and read
directly: there is no build step and no bundler, and `//go:embed web` takes
them as they are at compile time.

`web/index.html` is a `html/template` with two slots: the title and a JSON
bootstrap document. A blocking `init.js` in the head applies the stored theme
before the first paint. It loads three assets:

```text
/assets/init.js     reads the stored theme and sets data-theme, before paint
/assets/main.css    tokens, top bar, listing, dialogs, toasts, media queries
/assets/app.js      one IIFE, loaded at the end of the body
```

`app.js` runs inside a single IIFE, so the helpers and the `state` object share
one scope. It is laid out in the order it needs to run: state and helpers
first, then markup, then actions, upload, and finally the boot block that
wires the events.

`main.css` is one file in cascade order: tokens and reset, top bar, listing,
dialogs, toasts, media queries. Keep that order when adding a section, since
later rules still rely on it.

All files are embedded with `//go:embed web`, so editing them requires a
rebuild. They are served with `Cache-Control: no-cache` and gzipped from the
bytes cached at startup, and the pages use a restrictive
`Content-Security-Policy` (`script-src 'self'`, so no inline scripts; the
bootstrap JSON is a `type="application/json"` data block).

Sort order and view mode are stored in `localStorage`. The theme is only stored
when it contradicts the system preference: matching the system clears the entry
and the page follows `prefers-color-scheme` again. The `?view=` and `?theme=`
query parameters override both for one request, which keeps screenshots and deep
links deterministic.

## Tests

There is no automated test suite in the tree at the moment; `go test ./...`
reports `[no test files]`. Until tests are restored, use a temporary `HOME` and
a scratch root for manual checks:

- fresh `config` / `run`, generated password, second `run` with `-p`;
- login, upload, mkdir, rename and delete;
- path traversal attempts;
- CORS: allowed Origin preflight/login, denied Origin `403`.

## Release

1. Pick one version string and use it everywhere: `main.go`, the
   `CHANGELOG.md` heading and the git tag (`v0.0.2-alpha` for a pre-release or
   `v0.0.2` for a stable release).
2. Run `gofmt -l .`, `go vet ./...` and `go test ./...` (currently no test
   files), then do the manual smoke test above.
3. Run `./build.sh` (set `GOCACHE` to a writable directory when the default
   cache is read-only), verify one archive with `--version` and `help`, and
   attach all six `build/*.tar.gz` files.
4. Commit first, then create the tag; do not attach the stale root
   `./next-index` binary.
