package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEndpointResolution(t *testing.T) {
	cases := []struct{ base, resource, format, expected string }{
		{"http://localhost:20128/v1/messages", "chat", "messages", "http://localhost:20128/v1/messages"},
		{"http://localhost:20128/v1/messages", "models", "messages", "http://localhost:20128/v1/models"},
		{"https://example.test", "chat", "chat", "https://example.test/v1/chat/completions"},
		{"https://example.test/gateway/v1/chat/completions", "models", "chat", "https://example.test/gateway/v1/models"},
	}
	for _, c := range cases {
		result, err := resolveEndpoint(c.base, c.resource, c.format)
		if err != nil || result != c.expected {
			t.Errorf("got %q, %v; want %q", result, err, c.expected)
		}
	}
	for _, base := range []string{"", "file:///tmp/data", "https://key:secret@example.test"} {
		if _, err := resolveEndpoint(base, "chat", "chat"); err == nil {
			t.Errorf("invalid URL accepted: %s", base)
		}
	}
}
func TestGatewayStreamsAndUsesOnlyConfiguredCredentials(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/v1/messages" {
			t.Errorf("wrong path: %s", req.URL.Path)
		}
		if req.Header.Get("X-Api-Key") != "configured-key" || req.Header.Get("Authorization") != "Bearer configured-key" {
			t.Error("configured credentials missing")
		}
		if req.Header.Get("Anthropic-Version") == "" {
			t.Error("messages protocol version missing")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"delta\":{\"text\":\"hello\"}}\n\n")
		w.(http.Flusher).Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer upstream.Close()
	r := testRepository(t)
	settings, _ := json.Marshal(gatewaySettings{BaseURL: upstream.URL + "/v1/messages", APIKey: "configured-key"})
	if err := r.saveSettings(string(settings)); err != nil {
		t.Fatal(err)
	}
	a := &App{store: r}
	response := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/omniroute", strings.NewReader(`{"model":"selected-model"}`))
	req.Header.Set("Authorization", "untrusted-value")
	a.serveGateway(response, req)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "[DONE]") {
		t.Fatalf("failed streaming: %d %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Error("sensitive response was cacheable")
	}
}
func TestThemeBootstrapEscapesScriptContent(t *testing.T) {
	r := testRepository(t)
	if err := r.saveSettings(`{"theme":"dark","name":"</script><script>alert(1)</script>"}`); err != nil {
		t.Fatal(err)
	}
	a := &App{store: r}
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, `<script>window.__KALAM_BOOTSTRAP__ = /*__KALAM_BOOTSTRAP__*/ null;</script>`)
	})
	response := httptest.NewRecorder()
	a.middleware(next).ServeHTTP(response, httptest.NewRequest("GET", "/", nil))
	body := response.Body.String()
	if !strings.Contains(body, `"theme":"dark"`) || strings.Contains(body, "<script>alert(1)") || strings.Contains(body, "/*__KALAM_BOOTSTRAP__*/") {
		t.Fatalf("unsafe bootstrap: %s", body)
	}
}
func TestGatewayRejectsUnknownRoutesAndMissingConnection(t *testing.T) {
	a := &App{store: testRepository(t)}
	for _, path := range []string{"/api/not-allowed", "/api/omniroute", "/api/mcp/missing"} {
		response := httptest.NewRecorder()
		a.serveGateway(response, httptest.NewRequest("POST", path, strings.NewReader(`{}`)))
		if response.Code < 400 {
			t.Errorf("%s returned %d", path, response.Code)
		}
	}
}
func TestCrossHostRedirectsCannotLeakKeys(t *testing.T) {
	first, _ := http.NewRequestWithContext(context.Background(), "GET", "https://one.example/a", nil)
	second, _ := http.NewRequestWithContext(context.Background(), "GET", "https://other.example/b", nil)
	if err := upstreamClient.CheckRedirect(second, []*http.Request{first}); err == nil {
		t.Fatal("cross-host redirect allowed")
	}
}
