package main

import (
	"archive/zip"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"acovia.net/record"
)

func (server *Server) serveZip(w http.ResponseWriter, r *http.Request, dirPath string) {
	name := filepath.Base(dirPath)

	if name == "." || name == string(filepath.Separator) || name == "" {
		name = "files"
	}

	name += ".zip"

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
		"filename": name,
	}))
	w.Header().Set("Cache-Control", "no-store")

	if r.Method == http.MethodHead {
		return
	}

	writer := zip.NewWriter(w)

	walkErr := filepath.WalkDir(dirPath, func(current string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if current == dirPath || entry.Type()&fs.ModeSymlink != 0 {
			return nil
		}

		if strings.HasPrefix(entry.Name(), tempNamePrefix) {
			return nil
		}

		relative, err := filepath.Rel(dirPath, current)
		if err != nil {
			return err
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}

		header.Name = filepath.ToSlash(relative)
		header.Method = zip.Deflate

		if entry.IsDir() {
			header.Name += "/"
			header.Method = zip.Store

			_, err = writer.CreateHeader(header)

			return err
		}

		file, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}

		source, err := os.Open(current)
		if err != nil {
			return err
		}

		_, copyErr := io.Copy(file, source)
		source.Close()

		return copyErr
	})

	if err := writer.Close(); err != nil {
		record.Warn("close archive", dirPath, ":", err)
		return
	}

	if walkErr != nil {
		record.Warn("archive", dirPath, ":", walkErr)
	}
}
