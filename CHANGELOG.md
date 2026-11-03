# Changelog

All notable changes to NEXT_INDEX are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## 0.1.0 - 2026-11-03

### Fixed

- Ctrl+C while `next-index passwd` is reading a password now restores the
  terminal state before exiting.
- The first-run credentials are logged through the INFO logger instead of a
  hand-drawn box.

### Added

- Renamed the project to NEXT_INDEX. The binary is `next-index` and the config
  is `~/.next_index.json`.
- Serve any directory over HTTP with a list/grid interface, breadcrumbs,
  search, sortable columns, thumbnails, relative timestamps and a light/dark
  theme.
- A plain, flat interface with a single #004f8f accent.
- Public browsing and downloads; a username and password are only required to
  upload, create folders, rename and delete.
- Config file at `~/.next_index.json`, created on the first run, with a generated
  password printed once.
- `serve`, `passwd`, `config`, `about` and `help` commands.
- Multipart uploads with progress, drag and drop of files and folders,
  multi-file selection, overwrite and automatic `name-1.ext` renaming.
- Folder creation, rename and recursive delete.
- `opt` and `record` vendored from mc-saver, wired with `replace` directives.
- Optional HTTPS, upload size limit and request logging.
- Path containment checks, symlink escape protection, attachment disposition
  for active content, login rate limiting and security headers.
