# NEXT_INDEX

> The front-end page of this project is maintained by AI, and the back-end is maintained by myself.

A small, plain, public web file index server. Point it at a directory and browse
it in a browser.

Two ways to use it:

- **Public browsing**: anyone who opens the address can walk the folders and
  download files.
- **Sign in to manage**: upload, create a folder, rename, move, copy and delete
  need the username and password.

## Quick start

```bash
./next-index ~/Downloads
```

The first run writes `~/.next_index.json`, generates a password and prints it
once. Use `next-index config <option>` to change what is stored there.

## Features

- Breadcrumbs, sorting, list and grid views, and a light and dark theme that
  follows the system until you pick one.
- Multi-file and whole-folder uploads with per-file progress, optional overwrite
  and automatic `name-1.ext` renaming.
- Path traversal is refused, and active content is served as an attachment
  instead of running in the page. Symlinks are followed as-is: a link inside the
  root may point outside it, so only share a tree you control.
- Optional TLS and an upload size limit.

## Options

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

| Option | Description |
| --- | --- |
| `-i, --addr <ip>` | listen address (default `0.0.0.0`) |
| `-p, --port <port>` | port (default `8080`) |
| `-r, --root <dir>` | directory to serve |
| `-u, --user <name>` | username for writes (default `admin`) |
| `-P, --password <pass>` | password for writes, hashed before storing (ends up in shell history) |
| `-x, --max-size <mb>` | upload limit in MiB, `0` means no limit |
| `-o, --cross-origin <origin>` | exact Origin allowed to call the API |
| `-q, --quiet` | do not log every request |
| `-c, --color` | colored log output |
| `-t, --time` | timestamp every log line |

`run` applies the flags to that process only. Credentials and the root are worth
saving with `config` when you want them to persist.

Keys to press: `g` toggles list and grid, `u` uploads, `n` creates a folder,
`Esc` closes a dialog, and files dropped on the page are uploaded.

## Config

`~/.next_index.json`, written with `0600` because it holds the password hash:

| Field | Description |
| --- | --- |
| `root` | directory served by the server |
| `addr`, `port` | listen address and port |
| `title` | site title in the header and page title |
| `username`, `password` | credentials required for writes, password stored as a SHA-256 hex hash |
| `tls` | enable HTTPS with a certificate and key path |
| `max_upload_mb` | maximum upload size in MiB, `0` means no limit |
| `allow_origin` | exact Origin allowed for cross-origin API calls |

Missing fields are filled with the defaults on load.

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
| `POST` | `/@next-index/api/move` | write | `{"path":"/dir/","names":["a.txt"],"to":"/other/"}` |
| `POST` | `/@next-index/api/copy` | write | same body as `move` |
| `POST` | `/@next-index/api/delete` | write | `{"path":"/dir/","names":["a.txt","folder"]}` |

Write endpoints accept the `next_index_session` cookie or HTTP Basic auth:

```bash
curl -u admin:password -F "file=@photo.jpg" \
  "http://localhost:8080/@next-index/api/upload?path=/photos/"
```

A request that would overwrite an existing name answers `409`; `403` means the
path is outside the root or the caller is not signed in, and `400` means the name
or the body is invalid.

## Build

```bash
git clone https://github.com/fovlin/next-index
cd next-index
go build .
```

`./build.sh` cross-compiles the release targets.

## Note

Reads are public, writes are not. There are no per-folder permissions and no
user accounts beyond the single stored pair, so put it behind a reverse proxy or
a VPN before exposing it to the internet.

## License

GNU General Public License v3. See [LICENSE](LICENSE).
