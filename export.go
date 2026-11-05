package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SaveExport always asks the user for a destination. It cannot read arbitrary files.
func (a *App) SaveExport(name, content string) (bool, error) {
	if a.ctx == nil {
		return false, errors.New("application is not ready")
	}
	if len(content) > 150*1024*1024 {
		return false, errors.New("export exceeds the 150 MB safety limit")
	}
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	extension := strings.ToLower(filepath.Ext(name))
	allowed := map[string]bool{".json": true, ".md": true, ".html": true, ".tsx": true, ".svg": true, ".mmd": true, ".txt": true}
	if !allowed[extension] || len(name) > 240 {
		return false, errors.New("unsupported export filename")
	}
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title: "Save export", DefaultFilename: name,
		Filters: []wailsruntime.FileFilter{{DisplayName: strings.ToUpper(strings.TrimPrefix(extension, ".")) + " file", Pattern: "*" + extension}},
	})
	if err != nil || path == "" {
		return false, err
	}
	if filepath.Ext(path) == "" {
		path += extension
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return false, err
	}
	return true, nil
}
