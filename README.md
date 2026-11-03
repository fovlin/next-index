# NEXT_INDEX

A small, plain web file index server.

Browsing is public. The username and password are only required to upload,
create, rename and delete files.

## Feature

```bash
./next-index ~/Downloads
```

The first run creates `~/.next_index.json`, generates a password and prints it once.
The server then listens on <http://localhost:8080>.

## Features

- **A clean interface** — breadcrumbs, search, sortable columns, list and grid
  views, thumbnails, light and dark themes, responsive layout and keyboard
  shortcuts, with a single #004f8f accent.
- **Protected writes, public reads** — the login is only checked for uploads,
  folder creation, rename and delete. Downloads and browsing stay public.
- **Uploads with progress** — multi-file and folder selection, drag and drop of
  files or whole folders, per-file progress, optional overwrite and automatic
  `name-1.ext` renaming.
- **File management** — create folders, rename, delete, download.
- **Safe by default** — path traversal is rejected, symlinks cannot escape the
  root directory, HTML/SVG files are served as attachments, login attempts are
  rate limited.
- **One binary** — the HTML, CSS, JavaScript and icons are embedded with
  `go:embed`; there are no runtime dependencies.
- **Optional TLS** and an upload size limit in the config file.

## Install

```bash
git clone https://github.com/fovlin/next-index
cd next-index
go build .
```

Or cross-compile every release target with `./build.sh`.

## Usage

```bash
next-index [command] [options] [root]

next-index ~/Downloads                # serve a directory for this run
next-index run -p 9000 .              # serve with overrides for this run
next-index config                     # print an existing config
next-index config -p 9000 -i 0.0.0.0  # save address and port
next-index config -u admin -P "new password"  # save credentials
next-index config -r ~/Downloads      # save the root
next-index config -o http://localhost:3000  # save an allowed Origin
next-index about                      # build information
next-index help                       # the full usage text
```

The root directory defaults to the `root` value in `~/.next_index.json`, then to the
current directory. `run` applies `-i`, `-p`, `-r`, `-u`, `-P` and `-o` to that
process only and never writes them back, except when it creates the config or
fills missing credentials. `config` with flags saves those fields silently;
without flags it prints an existing config, and a missing config is created
silently.

### Options

| Option | Description |
| --- | --- |
| `-i, --addr <ip>` | address for `run` / `config` (default `0.0.0.0`) |
| `-p, --port <port>` | port for `run` / `config` (default `8080`) |
| `-r, --root <dir>` | root directory for `run` / `config` |
| `-u, --user <name>` | username for `run` / `config` |
| `-P, --password <pass>` | password for `run` / `config` (hashed; leaks into shell history) |
| `-o, --cross-origin <origin>` | exact Origin allowed to call the API (experimental) |
| `-q, --quiet` | do not log every request |
| `-c, --color` | colored log output |
| `-t, --time` | timestamp every log line |
| `--version` | print the version |
| `-h, --help` | print the usage text |

## Configuration

The config lives in `~/.next_index.json` (next to `~/.ssh`, not in `~/.config`). It is
created by the first `run` or the first `config` and written with `0600`
permissions because it stores the password hash. A new config gets the defaults
below, `admin` as the username and a generated password, printed once.

`loadConfig` fills missing defaults and credentials in memory. `run` saves the
file when it is missing or credentials had to be generated, and otherwise applies
its flags to that process only. `config` saves flags and generated credentials
silently; without flags it prints a complete existing config, and a missing
config or missing credentials are created or repaired silently. The root
argument of `run` is not persisted: use `next-index config -r` or edit the file
for that.

```json
{
  "root": "/home/fovlin/Downloads",
  "addr": "0.0.0.0",
  "port": 8080,
  "title": "NEXT_INDEX",
  "username": "admin",
  "password": "<sha256 hex>",
  "tls": {
    "enable": false,
    "cert": "",
    "key": ""
  },
  "max_upload_mb": 1024,
  "allow_origin": ""
}
```

| Field | Description |
| --- | --- |
| `root` | directory served by the server |
| `addr` | listen address |
| `port` | listen port |
| `title` | site title shown in the header and page title |
| `username` | username required for writes |
| `password` | SHA-256 hash (hex); use `next-index config -P` to change it |
| `tls` | enable HTTPS with a certificate and key file |
| `max_upload_mb` | maximum request size in MiB, `0` means no limit |
| `allow_origin` | exact Origin allowed for cross-origin API calls (experimental) |

If `username` or `password` is empty, the next `run` or `config` fills it with
`admin` and a generated password and saves the config. There is no separate
read-only mode.

`next-index config -u admin -P "new password"` writes new credentials. A
password shorter than 8 characters is accepted with a warning.

`next-index config -p 9000 -i 127.0.0.1` saves the address and port;
`next-index config -r ~/Downloads` saves the root. Cross-origin support is
experimental: `allow_origin` must be an exact Origin such as
`http://localhost:3000`; the server answers CORS preflight and sends the matching
headers. Cross-site session cookies are still `SameSite=Lax`, so cross-origin
writes may need Basic auth or a cookie-policy change.

## The interface

- Click a folder or file name to open it. Click a table row to open it too.
- Click a column header to sort; click again to reverse.
- Press `/` to search, `g` to switch list/grid, `u` to upload, `n` for a new
  folder, `Esc` to close a dialog.
- Drag files anywhere onto the page to upload them.
- Use the sun/moon button to switch theme; the choice is remembered.


## HTTP API

The UI is a small client over a JSON API, which is also usable with `curl`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` and `/<path>` | public | directory page or file download |
| `GET` | `/@next-index/api/list?path=/dir/` | public | directory entries as JSON |
| `GET` | `/@next-index/api/session` | public | current login state |
| `POST` | `/@next-index/api/login` | public | `{"username":...,"password":...}`, sets a session cookie |
| `POST` | `/@next-index/api/logout` | session | clears the session |
| `POST` | `/@next-index/api/upload?path=/dir/` | write | multipart field `file`, optional `overwrite=1` |
| `POST` | `/@next-index/api/mkdir` | write | `{"path":"/dir/","name":"new folder"}` |
| `POST` | `/@next-index/api/rename` | write | `{"path":"/dir/","from":"a.txt","to":"b.txt"}` |
| `POST` | `/@next-index/api/delete` | write | `{"path":"/dir/","names":["a.txt","folder"]}` |

Write endpoints accept either the `next_index_session` cookie or HTTP Basic auth, so
a scripted upload can simply do:

```bash
curl -u admin:password -F "file=@photo.jpg" \
  "http://localhost:8080/@next-index/api/upload?path=/photos/"
```

State-changing requests with a mismatched `Origin` header are rejected unless
that exact Origin is configured with `allow_origin`; allowed origins also get
CORS preflight and response headers.

### Cross-origin API

Cross-origin access is experimental. Configure exactly one Origin:

```bash
next-index config -o http://localhost:3000
```

`allow_origin` is a full Origin (`scheme://host[:port]`), not a bare host and not
a path. When an allowed Origin calls the API, the server answers `OPTIONS`
preflight for `GET`/`POST` with `Content-Type`/`Authorization` and sends
`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials` and
`Vary: Origin`. Requests from other origins are rejected for writes.

Cross-site session cookies remain `SameSite=Lax`; for cross-origin writes use
HTTP Basic auth, or change the cookie policy only when serving over HTTPS.

## Security

- Paths are cleaned and checked against the root; symlinks are resolved and
  refused when they point outside it.
- Uploaded names are reduced to a base name, control characters are stripped and
  Windows-reserved names are prefixed with `_`.
- `.html`, `.svg`, `.xml` and script files are served with
  `Content-Disposition: attachment` so they cannot run in the site's origin.
- Passwords are stored as a single SHA-256 hash. The hash is deliberately
  unsalted; use a long password.
- Sessions are random 256-bit tokens kept in memory, valid for 12 hours, in an
  `HttpOnly` cookie (`SameSite=Lax`, `Secure` when TLS is on).
- Five failed logins from one address block that address for five minutes.
- A restrictive `Content-Security-Policy` and `X-Frame-Options: DENY` protect
  the UI pages.

The server is not a replacement for a hardened web server: it has no
per-directory permissions, no per-user accounts and no audit log. Run it behind
a reverse proxy or a VPN if you expose it to the internet.

## Development

```bash
gofmt -l .          # formatting
go vet ./...        # static checks
go build .          # build the binary
```

There is no automated test suite in the tree at the moment; use a scratch
directory and `curl` for manual checks.

The `opt` and `record` packages are vendored from
[mc-saver](https://github.com/fovlin/mc-saver) as separate modules and wired up
with `replace` directives in `go.mod`. See [DEVELOP.md](DEVELOP.md) for the
layout and request flow.

## License

GNU General Public License v3. See [LICENSE](LICENSE).
