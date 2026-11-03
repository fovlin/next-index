# NEXT_INDEX

A small, plain web file server. Point it at a directory and it serves a clean
nginx-autoindex style page with the useful parts: folders, sizes, timestamps,
search, sorting, list and grid views, drag and drop uploads and file management.
The interface is deliberately quiet: flat surfaces, one #004f8f accent, no
gradients.

Browsing is public. The username and password are only required to upload,
create, rename and delete files.

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

next-index ~/Downloads          # serve a directory
next-index serve -p 9000 .      # serve the current directory on port 9000
next-index passwd               # set or change the upload credentials
next-index config               # print the config file
next-index about                # build information
next-index help                 # the full usage text
```

`root` defaults to the `root` value in `~/.next_index.json`, and then to the current
directory. A root given on the command line is saved back to the config.

### Options

| Option | Description |
| --- | --- |
| `-a, --addr <ip>` | address to listen on (default `0.0.0.0`) |
| `-p, --port <port>` | port to listen on (default `8080`) |
| `-r, --root <dir>` | directory to serve |
| `-u, --user <name>` | username for `passwd` |
| `-P, --password <pass>` | password for `passwd` (leaks into shell history) |
| `-q, --quiet` | do not log every request |
| `-c, --color` | colored log output |
| `-t, --time` | timestamp every log line |
| `--version` | print the version |
| `-h, --help` | print the usage text |

## Configuration

The config lives in `~/.next_index.json` (next to `~/.ssh`, not in `~/.config`). It is
created on the first run and written with `0600` permissions because it stores
the password hash.

```json
{
  "root": "/home/fovlin/Downloads",
  "addr": "0.0.0.0",
  "port": 8080,
  "title": "NEXT_INDEX",
  "username": "admin",
  "password": "pbkdf2-sha256$210000$...$...",
  "tls": {
    "enable": false,
    "cert": "",
    "key": ""
  },
  "max_upload_mb": 1024
}
```

| Field | Description |
| --- | --- |
| `root` | directory served by the server |
| `addr` | listen address |
| `port` | listen port |
| `title` | site title shown in the header and page title |
| `username` | username required for writes |
| `password` | salted pbkdf2-sha256 hash; use `next-index passwd` to change it |
| `tls` | enable HTTPS with a certificate and key file |
| `max_upload_mb` | maximum request size in MiB, `0` means no limit |

Leave `username` and `password` empty to run read-only: the login button
disappears and every write endpoint answers `403`.

`next-index passwd` prompts twice without echoing, and accepts `-u` and `-P` for
scripted setup. A password shorter than 8 characters is accepted with a warning.

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
| `GET` | `/api/list?path=/dir/` | public | directory entries as JSON |
| `GET` | `/api/session` | public | current login state |
| `POST` | `/api/login` | public | `{"username":...,"password":...}`, sets a session cookie |
| `POST` | `/api/logout` | session | clears the session |
| `POST` | `/api/upload?path=/dir/` | write | multipart field `file`, optional `overwrite=1` |
| `POST` | `/api/mkdir` | write | `{"path":"/dir/","name":"new folder"}` |
| `POST` | `/api/rename` | write | `{"path":"/dir/","from":"a.txt","to":"b.txt"}` |
| `POST` | `/api/delete` | write | `{"path":"/dir/","names":["a.txt","folder"]}` |

Write endpoints accept either the `next_index_session` cookie or HTTP Basic auth, so
a scripted upload can simply do:

```bash
curl -u admin:password -F "file=@photo.jpg" \
  "http://localhost:8080/api/upload?path=/photos/"
```

State-changing requests with a mismatched `Origin` header are rejected.

## Security

- Paths are cleaned and checked against the root; symlinks are resolved and
  refused when they point outside it.
- Uploaded names are reduced to a base name, control characters are stripped and
  Windows-reserved names are prefixed with `_`.
- `.html`, `.svg`, `.xml` and script files are served with
  `Content-Disposition: attachment` so they cannot run in the site's origin.
- Passwords are stored as salted pbkdf2-sha256 hashes (210,000 iterations).
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
