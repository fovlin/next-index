# Changelog

All notable changes to NEXT_INDEX are documented here. The project follows
[Semantic Versioning](https://semver.org/).

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
