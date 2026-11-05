package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"time"
)

type gatewaySettings struct {
	BaseURL        string `json:"baseUrl"`
	APIKey         string `json:"apiKey"`
	APIFormat      string `json:"apiFormat"`
	SearchEndpoint string `json:"searchEndpoint"`
	SearchAPIKey   string `json:"searchApiKey"`
	SearchMethod   string `json:"searchMethod"`
}
type gatewayConnector struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	AuthHeader string `json:"authHeader"`
	AuthValue  string `json:"authValue"`
}

var upstreamClient = &http.Client{Transport: &http.Transport{
	Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 45 * time.Second,
	IdleConnTimeout: 90 * time.Second, MaxIdleConns: 20,
}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("too many upstream redirects")
	}
	if len(via) > 0 && req.URL.Host != via[0].URL.Host {
		return errors.New("cross-host redirects are blocked to protect credentials")
	}
	return nil
}}

func resolveEndpoint(base, resource, format string) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(base), "/"))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		return "", errors.New("set a valid HTTP(S) OmniRoute Base URL in Settings")
	}
	path := strings.TrimRight(parsed.Path, "/")
	for _, suffix := range []string{"/chat/completions", "/messages", "/models"} {
		path = strings.TrimSuffix(path, suffix)
	}
	if path == "" {
		path = "/v1"
	}
	if resource == "models" {
		path += "/models"
	} else if format == "messages" {
		path += "/messages"
	} else {
		path += "/chat/completions"
	}
	parsed.Path = path
	return parsed.String(), nil
}
func (a *App) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") {
			a.serveGateway(w, req)
			return
		}
		if req.Method == http.MethodGet && (req.URL.Path == "/" || req.URL.Path == "/index.html") {
			recorder := httptest.NewRecorder()
			next.ServeHTTP(recorder, req)
			body := recorder.Body.Bytes()
			if strings.Contains(recorder.Header().Get("Content-Type"), "text/html") {
				settings, err := a.store.settings()
				if err == nil {
					// Only appearance belongs in startup HTML, never credentials or personal
					// instructions. Marshal again so strings cannot close the script element.
					var appearance struct {
						Theme    string  `json:"theme,omitempty"`
						Font     string  `json:"font,omitempty"`
						FontSize float64 `json:"fontSize,omitempty"`
					}
					if json.Unmarshal([]byte(settings), &appearance) == nil {
						encoded, _ := json.Marshal(appearance)
						body = bytes.Replace(body, []byte("/*__KALAM_BOOTSTRAP__*/ null"), encoded, 1)
					}
				}
			}
			for name, values := range recorder.Header() {
				if strings.EqualFold(name, "Content-Length") {
					continue
				}
				for _, value := range values {
					w.Header().Add(name, value)
				}
			}
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(recorder.Code)
			_, _ = w.Write(body)
			return
		}
		next.ServeHTTP(w, req)
	})
}
func gatewayError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"error": map[string]string{"message": err.Error()}})
}
func (a *App) serveGateway(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet && req.Method != http.MethodPost && req.Method != http.MethodDelete {
		gatewayError(w, 405, errors.New("method not allowed"))
		return
	}
	raw, err := a.store.settings()
	if err != nil {
		gatewayError(w, 500, err)
		return
	}
	var settings gatewaySettings
	if err := json.Unmarshal([]byte(raw), &settings); err != nil {
		gatewayError(w, 500, err)
		return
	}
	var target string
	method := req.Method
	body := io.Reader(http.MaxBytesReader(w, req.Body, 48*1024*1024))
	headers := http.Header{"Content-Type": {"application/json"}, "Accept": {"application/json, text/event-stream"}}
	switch {
	case req.URL.Path == "/api/omniroute" || req.URL.Path == "/api/models":
		format := req.Header.Get("X-Kalam-Format")
		if format != "messages" && format != "chat" {
			format = settings.APIFormat
		}
		if format == "auto" || format == "" {
			if strings.Contains(settings.BaseURL, "/messages") {
				format = "messages"
			} else {
				format = "chat"
			}
		}
		resource := "chat"
		if req.URL.Path == "/api/models" {
			resource = "models"
			method = "GET"
			body = nil
		}
		target, err = resolveEndpoint(settings.BaseURL, resource, format)
		if settings.APIKey != "" {
			headers.Set("Authorization", "Bearer "+settings.APIKey)
			headers.Set("X-Api-Key", settings.APIKey)
		}
		if format == "messages" {
			headers.Set("Anthropic-Version", "2023-06-01")
		}
	case req.URL.Path == "/api/search":
		var query struct {
			Query string `json:"query"`
		}
		if err = json.NewDecoder(body).Decode(&query); err != nil || query.Query == "" {
			gatewayError(w, 400, errors.New("search query is required"))
			return
		}
		if settings.SearchEndpoint == "" {
			gatewayError(w, 400, errors.New("configure a search endpoint in Settings"))
			return
		}
		target = strings.ReplaceAll(settings.SearchEndpoint, "{query}", url.QueryEscape(query.Query))
		method = settings.SearchMethod
		if method != "POST" {
			method = "GET"
			body = nil
			if !strings.Contains(settings.SearchEndpoint, "{query}") {
				parsed, e := url.Parse(target)
				if e != nil {
					err = e
				} else {
					q := parsed.Query()
					q.Set("q", query.Query)
					parsed.RawQuery = q.Encode()
					target = parsed.String()
				}
			}
		} else {
			encoded, _ := json.Marshal(map[string]string{"query": query.Query, "q": query.Query})
			body = bytes.NewReader(encoded)
		}
		if settings.SearchAPIKey != "" {
			headers.Set("Authorization", "Bearer "+settings.SearchAPIKey)
		}
	case strings.HasPrefix(req.URL.Path, "/api/mcp/"):
		id := strings.TrimPrefix(req.URL.Path, "/api/mcp/")
		var payload string
		if e := a.store.db.QueryRow("SELECT payload FROM connectors WHERE id=?", id).Scan(&payload); e != nil {
			gatewayError(w, 404, errors.New("connector not found; save it before testing"))
			return
		}
		var connector gatewayConnector
		if e := json.Unmarshal([]byte(payload), &connector); e != nil {
			gatewayError(w, 500, e)
			return
		}
		target = connector.URL
		if connector.AuthHeader != "" && connector.AuthValue != "" {
			headers.Set(connector.AuthHeader, connector.AuthValue)
		}
		for _, key := range []string{"Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-Id"} {
			if value := req.Header.Get(key); value != "" {
				headers.Set(key, value)
			}
		}
	default:
		gatewayError(w, 404, errors.New("unknown API route"))
		return
	}
	if err != nil {
		gatewayError(w, 400, err)
		return
	}
	parsed, err := url.Parse(target)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		gatewayError(w, 400, errors.New("upstream must be a valid HTTP(S) URL"))
		return
	}
	upstream, err := http.NewRequestWithContext(req.Context(), method, target, body)
	if err != nil {
		gatewayError(w, 400, err)
		return
	}
	upstream.Header = headers
	response, err := upstreamClient.Do(upstream)
	if err != nil {
		if req.Context().Err() == nil {
			gatewayError(w, 502, fmt.Errorf("could not reach configured endpoint: %w", err))
		}
		return
	}
	defer response.Body.Close()
	for _, key := range []string{"Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version"} {
		if value := response.Header.Get(key); value != "" {
			w.Header().Set(key, value)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(response.StatusCode)
	buffer := make([]byte, 16*1024)
	for {
		n, err := response.Body.Read(buffer)
		if n > 0 {
			if _, e := w.Write(buffer[:n]); e != nil {
				return
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
		if err != nil {
			return
		}
	}
}
