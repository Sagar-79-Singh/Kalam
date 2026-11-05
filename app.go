package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App exposes narrow persistence, streaming, export, and external-link actions used by the UI.
type App struct {
	ctx       context.Context
	store     *repository
	requestMu sync.Mutex
	requests  map[string]context.CancelFunc
	requestWG sync.WaitGroup
	closing   bool
	eventSink func(string, streamPacket)
}

func newApp() (*App, error) {
	directory, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("find application data directory: %w", err)
	}
	store, err := openRepository(filepath.Join(directory, applicationName(), "data.sqlite"))
	if err != nil {
		return nil, err
	}
	return &App{store: store}, nil
}
func (a *App) startup(ctx context.Context) { a.ctx = ctx }
func (a *App) shutdown(context.Context) {
	a.requestMu.Lock()
	a.closing = true
	for _, cancel := range a.requests {
		cancel()
	}
	a.requestMu.Unlock()
	a.requestWG.Wait()
	_ = a.store.db.Close()
}
func (a *App) GetSettings() (string, error)     { return a.store.settings() }
func (a *App) PutSettings(value string) error   { return a.store.saveSettings(value) }
func (a *App) GetChats() (string, error)        { return a.store.chats() }
func (a *App) PutChat(value string) error       { return a.store.saveChat(value) }
func (a *App) DeleteChat(id string) error       { return a.store.remove("chats", id) }
func (a *App) GetSkills() (string, error)       { return a.store.list("skills") }
func (a *App) PutSkill(value string) error      { return a.store.save("skills", value) }
func (a *App) DeleteSkill(id string) error      { return a.store.remove("skills", id) }
func (a *App) GetMemories() (string, error)     { return a.store.list("memories") }
func (a *App) PutMemory(value string) error     { return a.store.save("memories", value) }
func (a *App) DeleteMemory(id string) error     { return a.store.remove("memories", id) }
func (a *App) GetConnectors() (string, error)   { return a.store.list("connectors") }
func (a *App) PutConnector(value string) error  { return a.store.save("connectors", value) }
func (a *App) DeleteConnector(id string) error  { return a.store.remove("connectors", id) }
func (a *App) GetProjects() (string, error)     { return a.store.list("projects") }
func (a *App) PutProject(value string) error    { return a.store.save("projects", value) }
func (a *App) DeleteProject(id string) error    { return a.store.removeProject(id) }
func (a *App) RestoreBackup(value string) error { return a.store.restore(value) }
func (a *App) OpenExternal(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
		return errors.New("only valid HTTP and HTTPS links can be opened")
	}
	if a.ctx == nil {
		return errors.New("application is not ready")
	}
	wailsruntime.BrowserOpenURL(a.ctx, raw)
	return nil
}

func validObject(raw string) (map[string]json.RawMessage, error) {
	if len(raw) > 150*1024*1024 {
		return nil, errors.New("document exceeds the 150 MB safety limit")
	}
	var value map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &value); err != nil || value == nil {
		return nil, errors.New("expected a valid JSON object")
	}
	return value, nil
}
