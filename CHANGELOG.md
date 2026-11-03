# Changelog

All notable changes to NEXT_INDEX are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## 0.1.0 - 2026-11-03

### Added

- Renamed the project to NEXT_INDEX. The binary is `next-index` and the config
  is `~/.next_index.json`.
- Serve any directory over HTTP with a list/grid interface, breadcrumbs,
  search, sortable columns, thumbnails, relative timestamps and a light/dark
  theme.
- A plain, flat interface with a single #004f8f accent.
- Public browsing and downloads; a username and password are only required to
  upload, create folders, rename and delete.
- Config file at `~/.next_index.json`, created on first use, with a generated
  password printed once.
- `run`, `config`, `about` and `help` commands.
- `run` starts the server; `-a`, `-p`, `-r`, `-u` and `-P` apply to that run only.
- `config` prints the config when called without flags, and saves `-a`, `-p`,
  `-r`, `-u` and `-P` when they are given.
- Multipart uploads with progress, drag and drop of files and folders,
  multi-file selection, overwrite and automatic `name-1.ext` renaming.
- Folder creation, rename and recursive delete.
- `opt` and `record` vendored from mc-saver, wired with `replace` directives.
- Optional HTTPS, upload size limit and request logging.
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
