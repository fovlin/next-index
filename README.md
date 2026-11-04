# NEXT_INDEX

A small, plain web file server. Point it at a directory and it serves an
nginx-autoindex style page with the parts worth having: search, sortable
columns, list and grid views, thumbnails, drag and drop uploads and file
management.

Browsing and downloads are public. A username and password are only required to
upload, create folders, rename and delete.

```bash
./next-index ~/Downloads
# serving http://localhost:8080
```

The first run creates `~/.next_index.json`, generates a password and prints it
once.

## Features

- Breadcrumbs, search, sorting, list and grid views, image thumbnails, light and
  dark themes, responsive layout and keyboard shortcuts.
- Public reads; login only for upload, mkdir, rename and delete.
- Multi-file and whole-folder drag and drop uploads with per-file progress,
  optional overwrite and automatic `name-1.ext` renaming.
- Create folder, rename, delete, download.
- Path traversal and symlink escapes are rejected, active content is served as
  an attachment, failed logins are rate limited.
- A single binary: HTML, CSS, JS and icons are embedded with `go:embed`.
- Optional TLS and an upload size limit.

## Install

```bash
git clone https://github.com/fovlin/next-index
cd next-index
go build .
```

`./build.sh` cross-compiles the release targets.

## Usage

```
next-index [command] [options] [root]
```

| Command | Description |
| --- | --- |
| `run` | serve a directory (default command) |
| `config` | save flags to the config, or print the current config |
| `unset <field>` | remove one top level key from the config file |
| `about` | build information |
| `help` | usage text |

```bash
next-index ~/Downloads                        # serve a directory for this run
next-index run -p 9000 -i 127.0.0.1 ./public  # overrides for this run only
next-index config -p 9000 -i 0.0.0.0          # save address and port
next-index config -u admin -P "new password"  # save credentials
next-index config -r ~/Downloads              # save the root
next-index config -o http://localhost:3000    # allow one cross-origin API caller
next-index config                             # print the config
next-index unset allow_origin                 # drop a key
```

`run` applies `-i`, `-p`, `-r`, `-u`, `-P`, `-x` and `-o` to that process only;
they are written to the config just when it is created or credentials had to be
generated. The root argument of `run` is never saved, use `config -r` for that.

| Option | Description |
| --- | --- |
| `-i, --addr <ip>` | listen address (default `0.0.0.0`) |
| `-p, --port <port>` | port (default `8080`) |
| `-r, --root <dir>` | directory to serve |
| `-u, --user <name>` | username for writes (default `admin`) |
| `-P, --password <pass>` | password for writes, hashed before storing (ends up in shell history) |
| `-x, --max-size <mb>` | upload limit in MiB, `0` means no limit |
| `-o, --cross-origin <origin>` | exact Origin allowed to call the API (experimental) |
| `-q, --quiet` | do not log every request |
| `-c, --color` | colored log output |
| `-t, --time` | timestamp every log line |
| `--version` | print the version |
| `-h, --help` | print the usage text |

The interface: click a name or a row to open it, click a column header to sort,
`/` searches, `g` toggles list and grid, `u` uploads, `n` creates a folder, `Esc`
closes a dialog. Files dropped anywhere on the page are uploaded, and the theme
button remembers your choice.

## Configuration

`~/.next_index.json`, written with `0600` because it holds the password hash.
Missing fields are filled with these values on load:

```json
{
  "root": "./",
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
  "max_upload_mb": 0,
  "allow_origin": ""
}
```

| Field | Description |
| --- | --- |
| `root` | directory served by the server |
| `addr`, `port` | listen address and port |
| `title` | site title in the header and page title |
| `username`, `password` | credentials required for writes, password stored as a SHA-256 hex hash |
| `tls` | enable HTTPS with a certificate and key path |
| `max_upload_mb` | maximum request body in MiB, `0` means no limit |
| `allow_origin` | exact Origin allowed for cross-origin API calls (experimental) |

Empty credentials are replaced with `admin` and a generated password on the next
load and saved. There is no read-only mode.

## HTTP API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` and `/<path>` | public | directory page or file download |
| `GET` | `/@next-index/api/list?path=/dir/` | public | directory entries as JSON |
| `GET` | `/@next-index/api/session` | public | login state |
| `POST` | `/@next-index/api/login` | public | `{"username":…,"password":…}`, sets the session cookie |
| `POST` | `/@next-index/api/logout` | session | clears the session |
| `POST` | `/@next-index/api/upload?path=/dir/` | write | multipart field `file`, optional `overwrite=1` |
| `POST` | `/@next-index/api/mkdir` | write | `{"path":"/dir/","name":"new folder"}` |
| `POST` | `/@next-index/api/rename` | write | `{"path":"/dir/","from":"a.txt","to":"b.txt"}` |
| `POST` | `/@next-index/api/delete` | write | `{"path":"/dir/","names":["a.txt","folder"]}` |

Write endpoints accept the `next_index_session` cookie or HTTP Basic auth:

```bash
curl -u admin:password -F "file=@photo.jpg" \
  "http://localhost:8080/@next-index/api/upload?path=/photos/"
```

A state-changing request whose `Origin` does not match the server is rejected
unless that exact Origin is set in `allow_origin`. Allowed origins get CORS
preflight and response headers, but the session cookie stays `SameSite=Lax`, so
cross-origin writes should use Basic auth.

## Security

- Paths are cleaned and checked against the root, symlinks are resolved and
  refused when they point outside it.
- Uploaded names are reduced to a base name, control characters are stripped and
  Windows reserved names get a `_` prefix.
- `.htm`, `.html`, `.xhtml`, `.svg`, `.xml`, `.xsl`, `.xslt`, `.js` and `.mjs`
  are served as attachments so they cannot run in the site's origin.
- Passwords are a single unsalted SHA-256 hash: use a long one.
- Sessions are random 256-bit tokens in memory, valid for 12 hours, in an
  `HttpOnly` `SameSite=Lax` cookie (`Secure` with TLS).
- Five failed logins from one address block it for five minutes.
- Pages are sent with a restrictive `Content-Security-Policy`,
  `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

There are no per-directory permissions, per-user accounts or audit log. Put it
behind a reverse proxy or a VPN before exposing it to the internet.

## Development

```bash
gofmt -l .
go vet ./...
go build .
```

No automated tests yet; check changes against a scratch directory with `curl`.
`opt` and `record` come from [mc-saver](https://github.com/fovlin/mc-saver) and
are wired in with `replace` directives. [DEVELOP.md](DEVELOP.md) has the layout
and request flow.

## License

GNU General Public License v3. See [LICENSE](LICENSE).
