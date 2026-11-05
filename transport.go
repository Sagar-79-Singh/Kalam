package main

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Windows' Wails asset response writer buffers until EOF. Streaming requests use
// cancellable native events on every desktop platform instead. The frontend adapts
// these byte packets into the same ReadableStream/SSE parser used by browser fetch.
type streamPacket struct {
	Kind    string            `json:"kind"`
	Status  int               `json:"status,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Data    string            `json:"data,omitempty"`
	Error   string            `json:"error,omitempty"`
}

type nativeStreamWriter struct {
	ctx         context.Context
	header      http.Header
	wroteHeader bool
	emit        func(streamPacket)
}

func (w *nativeStreamWriter) Header() http.Header { return w.header }
func (w *nativeStreamWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	headers := map[string]string{}
	for name, values := range w.header {
		headers[name] = strings.Join(values, ", ")
	}
	w.emit(streamPacket{Kind: "headers", Status: status, Headers: headers})
}
func (w *nativeStreamWriter) Write(data []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	// Base64 preserves byte fragments that split a multi-byte UTF-8 character.
	w.emit(streamPacket{Kind: "chunk", Data: base64.StdEncoding.EncodeToString(data)})
	return len(data), nil
}
func (w *nativeStreamWriter) Flush() {}

func (a *App) emitStream(id string, packet streamPacket) {
	if a.eventSink != nil {
		a.eventSink("gateway:"+id, packet)
		return
	}
	wailsruntime.EventsEmit(a.ctx, "gateway:"+id, packet)
}

func validStreamID(id string) bool {
	if len(id) < 1 || len(id) > 128 {
		return false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

func (a *App) startRequest(id, path, payload string, headers http.Header) error {
	if a.ctx == nil {
		return errors.New("desktop transport is not ready")
	}
	if !validStreamID(id) {
		return errors.New("invalid stream identifier")
	}
	if len(payload) > 48*1024*1024 {
		return errors.New("request is too large; remove some attachments")
	}
	if _, err := validObject(payload); err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(a.ctx)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, path, strings.NewReader(payload))
	if err != nil {
		cancel()
		return err
	}
	req.Header = headers
	a.requestMu.Lock()
	if a.closing {
		a.requestMu.Unlock()
		cancel()
		return errors.New("application is closing")
	}
	if a.requests == nil {
		a.requests = map[string]context.CancelFunc{}
	}
	if _, exists := a.requests[id]; exists {
		a.requestMu.Unlock()
		cancel()
		return errors.New("stream identifier is already in use")
	}
	a.requests[id] = cancel
	a.requestWG.Add(1)
	a.requestMu.Unlock()
	go func() {
		defer a.requestWG.Done()
		defer cancel()
		defer func() { a.requestMu.Lock(); delete(a.requests, id); a.requestMu.Unlock() }()
		writer := &nativeStreamWriter{ctx: ctx, header: http.Header{}, emit: func(packet streamPacket) {
			if ctx.Err() == nil {
				a.emitStream(id, packet)
			}
		}}
		a.serveGateway(writer, req)
		if ctx.Err() != nil {
			return
		}
		if !writer.wroteHeader {
			writer.WriteHeader(http.StatusNoContent)
		}
		a.emitStream(id, streamPacket{Kind: "end"})
	}()
	return nil
}

// StartOmniRouteStream can only reach the single gateway saved in Settings.
func (a *App) StartOmniRouteStream(id, payload, format string) error {
	if format != "messages" && format != "chat" {
		return errors.New("invalid gateway protocol")
	}
	return a.startRequest(id, "/api/omniroute", payload, http.Header{"X-Kalam-Format": {format}})
}

// StartMCPRequest can only reach an already-saved connector, never an arbitrary URL.
func (a *App) StartMCPRequest(id, connectorID, payload, sessionID, protocol string) error {
	if connectorID == "" || len(connectorID) > 256 || len(sessionID) > 4096 || len(protocol) > 128 {
		return errors.New("invalid MCP request metadata")
	}
	headers := http.Header{}
	if sessionID != "" {
		headers.Set("Mcp-Session-Id", sessionID)
	}
	if protocol != "" {
		headers.Set("Mcp-Protocol-Version", protocol)
	}
	path := (&url.URL{Path: "/api/mcp/" + connectorID}).String()
	return a.startRequest(id, path, payload, headers)
}
func (a *App) CancelRequest(id string) {
	a.requestMu.Lock()
	cancel := a.requests[id]
	a.requestMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

var _ http.ResponseWriter = (*nativeStreamWriter)(nil)
var _ http.Flusher = (*nativeStreamWriter)(nil)
var _ io.Writer = (*nativeStreamWriter)(nil)
