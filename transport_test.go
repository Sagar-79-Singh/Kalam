package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNativeTransportDeliversBeforeEOFAndCancelsUpstream(t *testing.T) {
	cancelled := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"text\":\"नमस्ते\"}\n\n")
		w.(http.Flusher).Flush()
		<-req.Context().Done()
		close(cancelled)
	}))
	defer server.Close()
	r := testRepository(t)
	settings, _ := json.Marshal(gatewaySettings{BaseURL: server.URL + "/v1/messages"})
	if err := r.saveSettings(string(settings)); err != nil {
		t.Fatal(err)
	}
	packets := make(chan streamPacket, 10)
	a := &App{ctx: context.Background(), store: r, eventSink: func(_ string, packet streamPacket) { packets <- packet }}
	if err := a.StartOmniRouteStream("stream-test", `{"model":"test-model","stream":true}`, "messages"); err != nil {
		t.Fatal(err)
	}
	defer a.CancelRequest("stream-test")
	seen := ""
	deadline := time.After(3 * time.Second)
	for !strings.Contains(seen, "नमस्ते") {
		select {
		case packet := <-packets:
			if packet.Kind == "end" {
				t.Fatal("stream ended before explicit cancellation")
			}
			if packet.Kind == "chunk" {
				bytes, err := base64.StdEncoding.DecodeString(packet.Data)
				if err != nil {
					t.Fatal(err)
				}
				seen += string(bytes)
			}
		case <-deadline:
			t.Fatal("native bytes were buffered instead of delivered before EOF")
		}
	}
	a.CancelRequest("stream-test")
	select {
	case <-cancelled:
	case <-time.After(3 * time.Second):
		t.Fatal("stop did not cancel the upstream request")
	}
	a.requestWG.Wait()
}
func TestNativeTransportRejectsUnscopedRequests(t *testing.T) {
	a := &App{ctx: context.Background(), store: testRepository(t)}
	if err := a.StartOmniRouteStream("../unsafe", `{}`, "chat"); err == nil {
		t.Fatal("unsafe stream ID accepted")
	}
	if err := a.StartOmniRouteStream("safe-id", `[]`, "chat"); err == nil {
		t.Fatal("non-object payload accepted")
	}
	if err := a.StartOmniRouteStream("safe-id", `{}`, "arbitrary-protocol"); err == nil {
		t.Fatal("arbitrary protocol accepted")
	}
	if err := a.StartMCPRequest("safe-id", "", `{}`, "", ""); err == nil {
		t.Fatal("missing connector accepted")
	}
}
