//go:build !headless

package main

import (
	"context"
	"embed"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app, err := newApp()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Unable to open local data:", err)
		os.Exit(1)
	}
	err = wails.Run(&options.App{
		Title: applicationName(), Width: 1380, Height: 900, MinWidth: 720, MinHeight: 560,
		BackgroundColour: &options.RGBA{R: 245, G: 241, B: 232, A: 255},
		StartHidden:      true,
		OnDomReady:       func(ctx context.Context) { wailsruntime.WindowShow(ctx) },
		AssetServer:      &assetserver.Options{Assets: assets, Middleware: app.middleware},
		OnStartup:        app.startup, OnShutdown: app.shutdown, Bind: []interface{}{app},
		EnableDefaultContextMenu: true,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
