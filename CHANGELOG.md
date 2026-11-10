# Changelog

All notable changes to NEXT_INDEX are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## 1.0.1 - 2026-11-10

### Added

- `?download=1` streams a folder as a zip while the walk runs; the row menu
  offers it, and files answer the same parameter with an attachment.
- `-T, --title` sets the site title that the config already stored.

### Changed

- Downloading a folder now needs a signed-in visitor, so a public install no
  longer hands the whole tree out as one file. A single file stays public.

### Fixed

- The row menu stays inside the viewport on a short screen, and scrolls when it
  is taller than the screen.

## 1.0.0 - 2026-11-10

### Changed

- The password is no longer generated at start. `next-index passwd` asks for it
  twice and stores the hash; `run` refuses to start without one, so a generated
  password never ends up in the logs.
- Icons are 18px and the sort arrow 12px. Table cells, headers and dialog titles
  use the body size, which leaves three text sizes: 16, 14 and 12.
- Selecting files updates the row that changed instead of rebuilding the list.

### Removed

- The read-only mode. A config without a password is an error now, not a second
  way to run the server.

### Fixed

- `next-index unset <field>` restores the field's default; it used to write the
  old value back.
- Creating a folder that already exists answers `409` and a missing parent
  `404`, instead of `500`.
- A failed rename, move or copy no longer hands the filesystem path to the
  client; the detail goes to the log.

## 1.0.0-rc1 - 2026-11-09

### Added

- `next-index passwd` sets the password on the terminal: asked twice, never
  echoed, and the terminal is restored even when the prompt is interrupted.
- The login page carries the theme button and the site mark from the favicon.
- A reveal button in the password field.

### Changed

- `-P, --password` is gone, so a password no longer ends up in the shell
  history or the process list.
- The interface sits on a four pixel grid with four text sizes (16, 14, 12 and
  10), and the login card is 400px wide.
- Every request is logged apart from the embedded assets.
- Front end actions are dispatched through one table.

### Removed

- The subtitle under the login card.

## 0.0.10-beta - 2026-11-09

### Added

- `-f, --force-login`: anonymous visitors are sent to
  `/@next-index/login`, which keeps the requested path in `next`, and the list
  API answers `401`. Signing in returns to where they were going.
- `-s, --tls`, `--tls-cert` and `--tls-key` write the TLS settings that until
  now you could only edit in the config file.

## 0.0.9-beta - 2026-11-08

### Removed

- Drag and drop in the upload dialog. The dialog is a file picker now: choose
  files, or choose a folder and keep its structure.
- The dimmed file extension: a name is one colour again, and `nameMarkup` no
  longer has to split it.

### Changed

- Renaming selects the whole name, extension included.
- The select column sits closer to the name: 10px before the box, 6px after it.

## 0.0.8-beta - 2026-11-07

### Added

- Static assets are gzipped once at startup and served from memory when the
  client accepts it. Only assets are compressed; file downloads keep their
  range support and are sent as they are.

### Changed

- The front end is two hand-written files, `app.js` and `main.css`. The module
  split and the bundler detour between them are gone.
- The theme bootstrap is a small blocking `init.js` in the head, so there is no
  inline script and no CSP hash to keep in sync.
- The upload dialog still accepts dropped files; only the page-wide drop
  overlay and the folder recursion behind it were removed.

### Removed

- Dragging a folder onto the page. A folder can still be picked with "choose a
  folder", and files can still be dropped on the upload dialog.

## 0.0.7-beta - 2026-11-07

### Removed

- The search box, its `/` shortcut and the filtering behind it. Breadcrumbs and
  sorting cover the same ground with less to keep working.
- Image previews in the grid: every tile shows a type icon again, and the server
  no longer sends a `thumb` flag, so a folder of photos does not pull megabytes
  of originals just to draw the tiles.

### Changed

- The breadcrumbs moved out of the topbar into the content area and gained a
  border, so the topbar is a single row of icons.
- The topbar scrolls away with the page instead of staying pinned.
- The footer keeps only the status line.
- Only page views are logged; API errors log as warnings, so a 4xx from a client
  no longer looks like a fault of the server.
- The body has a 240px floor, so narrow screens keep their layout.

## 0.0.6-beta - 2026-11-06

### Added

- Copy and batch move: `POST /@next-index/api/copy` and
  `POST /@next-index/api/move`, plus multi-select in the listing and a per-row
  action menu (copy, move, rename, delete).
- The summary bar switches into a selection mode, so the checkboxes stay out of
  the way until you ask for them.

### Changed

- Symlinks inside the root are now followed, including links that point outside
  it, and path traversal is still refused. This reverses the old "symlink
  escapes are refused" promise, which the README now warns about.
- The topbar buttons share one size and drop their labels to icons on narrow
  screens; upload is only offered once you are signed in.
- The session cookie becomes `SameSite=None` only when the server terminates
  TLS and a cross-origin client is configured; otherwise it stays `Lax`. Login
  and logout now build it the same way.
- Split the front end into ES modules (`core`, `render`, `ui`, `api`,
  `actions`, `upload`) instead of one inline script.
- Each row and tile now carries its own action button: the row menu opens
  under the button and stays inside the page.
- Row and tile actions only light up the button, not the whole row, when the
  pointer is over them.

### Fixed

- Opening the upload dialog threw before it could render, because the module
  assigned to an imported binding.
- The search box lost the casing you typed as soon as the list re-rendered.
- `Ctrl`/`Cmd`/`Alt` shortcuts no longer trigger the upload, new folder and
  view shortcuts.
- Absolute date and time strings use one locale everywhere.
- `help` tells you that `-x` takes megabytes, and `0` means no limit.

### Internal

- Removed dead CSS rules and unused element hooks, and moved the toast and
  scroll-lock states from inline styles to classes.
- Helpers are only exported by the module that owns them.
- `config` and `unset` share one atomic config write, and `unset` no longer
  ignores a failed write.
- The reserved device names and the temporary file prefix live in one place
  instead of being repeated by the sanitizing and validating helpers.
- Dropped a leftover debug log line and a `SameSite` header that had no effect
  on a response.

## 0.0.2-alpha - 2026-11-03

### Added

- Renamed the project to NEXT_INDEX. The binary is `next-index` and the config
  is `~/.next_index.json`.
- Serve any directory over HTTP with a list/grid interface, breadcrumbs,
  search, sortable columns, thumbnails, absolute date/time and a light/dark
  theme.
- A plain, flat interface with a single #004f8f accent.
- Public browsing and downloads; a username and password are only required to
  upload, create folders, rename and delete.
- Config file at `~/.next_index.json`, created on first use, with a generated
  password printed once.
- `run`, `config`, `about` and `help` commands.
- `run` starts the server; `-i`, `-p`, `-r`, `-u`, `-P` and `-o` apply to that
  run only.
- `config` prints an existing config when called without flags, and saves `-i`,
  `-p`, `-r`, `-u`, `-P` and `-o` silently when they are given.
- Multipart uploads with progress, drag and drop of files and folders,
  multi-file selection, overwrite and automatic `name-1.ext` renaming.
- Folder creation, rename and recursive delete.
- `opt` and `record` vendored from mc-saver, wired with `replace` directives.
- Optional HTTPS, upload size limit, request logging and an experimental
  cross-origin API allowlist (`-o`, `allow_origin`) with exact-Origin matching
  and preflight handling.
- Path containment checks, symlink escape protection, attachment disposition
  for active content, login rate limiting and security headers.

### Changed

- Passwords are stored as a plain SHA-256 hash instead of PBKDF2.
- Replaced the `passwd` and `username` commands with `config` flags.
- API endpoints moved from `/api/` to `/@next-index/api/`, so a served directory named
  `api` is no longer shadowed.
- Static assets moved from `/_next/` to `/@next-index/assets/`.
- Removed the read-only mode. Empty credentials are replaced with `admin` and a
  generated password when the config is loaded.

### Fixed

- The first-run credentials are logged through the INFO logger instead of a
  hand-drawn box.
