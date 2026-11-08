package main

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func testRepository(t *testing.T) *repository {
	t.Helper()
	r, err := openRepository(filepath.Join(t.TempDir(), "data.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = r.db.Close() })
	return r
}
func sampleChat(id string) string {
	return `{"id":"` + id + `","title":"A thought","createdAt":1,"updatedAt":2,"incognito":false,"webSearch":false,"connectorIds":[],"model":"test-model","projectId":"p1","messages":[{"id":"m1","role":"user","content":"Hello","attachments":[],"createdAt":1}],"artifacts":[{"id":"a1","chatId":"` + id + `","title":"Page","type":"html","activeVersionId":"v1","versions":[{"id":"v1","number":1,"code":"<h1>Hello</h1>","createdAt":1}]}]}`
}
func TestChatRoundTripAndCascade(t *testing.T) {
	r := testRepository(t)
	if err := r.saveChat(sampleChat("chat-1")); err != nil {
		t.Fatal(err)
	}
	raw, err := r.chats()
	if err != nil {
		t.Fatal(err)
	}
	var chats []struct {
		ID        string            `json:"id"`
		Messages  []json.RawMessage `json:"messages"`
		Artifacts []json.RawMessage `json:"artifacts"`
	}
	if err := json.Unmarshal([]byte(raw), &chats); err != nil {
		t.Fatal(err)
	}
	if len(chats) != 1 || chats[0].ID != "chat-1" || len(chats[0].Messages) != 1 || len(chats[0].Artifacts) != 1 {
		t.Fatalf("unexpected chat: %s", raw)
	}
	if err := r.remove("chats", "chat-1"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"messages", "artifacts"} {
		var count int
		if err := r.db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s did not cascade", table)
		}
	}
}
func TestInvalidChatRollsBack(t *testing.T) {
	r := testRepository(t)
	if err := r.saveChat(sampleChat("chat")); err != nil {
		t.Fatal(err)
	}
	before, _ := r.chats()
	if err := r.saveChat(`{"id":"chat","title":"Broken","messages":[{"id":"duplicate"},{"id":"duplicate"}],"artifacts":[]}`); err == nil {
		t.Fatal("expected duplicate message failure")
	}
	after, _ := r.chats()
	if before != after {
		t.Fatal("failed write changed existing data")
	}
	if err := r.saveChat(`{"id":"private","incognito":true,"messages":[],"artifacts":[]}`); err == nil {
		t.Fatal("incognito data was accepted")
	}
}
func TestProjectRemovalKeepsConversations(t *testing.T) {
	r := testRepository(t)
	if err := r.save("projects", `{"id":"p1","name":"Project"}`); err != nil {
		t.Fatal(err)
	}
	if err := r.saveChat(sampleChat("chat")); err != nil {
		t.Fatal(err)
	}
	if err := r.removeProject("p1"); err != nil {
		t.Fatal(err)
	}
	raw, _ := r.chats()
	var chats []map[string]json.RawMessage
	_ = json.Unmarshal([]byte(raw), &chats)
	if len(chats) != 1 || chats[0]["projectId"] != nil {
		t.Fatalf("project removal lost or retained wrong data: %s", raw)
	}
}
func TestSettingsAndCollectionValidation(t *testing.T) {
	r := testRepository(t)
	if got, _ := r.settings(); got != "{}" {
		t.Fatal(got)
	}
	if err := r.saveSettings(`{"theme":"dark","apiKey":"private"}`); err != nil {
		t.Fatal(err)
	}
	if got, _ := r.settings(); got != `{"theme":"dark","apiKey":"private"}` {
		t.Fatal(got)
	}
	if err := r.saveSettings(`[]`); err == nil {
		t.Fatal("non-object settings accepted")
	}
	if err := r.save("arbitrary_table", `{"id":"x"}`); err == nil {
		t.Fatal("unknown collection accepted")
	}
	if err := r.save("skills", `{"id":""}`); err == nil {
		t.Fatal("empty id accepted")
	}
}
func TestRestoreIsAtomic(t *testing.T) {
	r := testRepository(t)
	if err := r.saveChat(sampleChat("original")); err != nil {
		t.Fatal(err)
	}
	before, _ := r.chats()
	backup := backupDocument{Version: 1, App: applicationName(), Settings: json.RawMessage(`{"theme":"light"}`), Chats: []json.RawMessage{json.RawMessage(sampleChat("new")), json.RawMessage(sampleChat("new"))}, Skills: []json.RawMessage{}, Memories: []json.RawMessage{}, Connectors: []json.RawMessage{}, Projects: []json.RawMessage{}}
	encoded, _ := json.Marshal(backup)
	if err := r.restore(string(encoded)); err == nil {
		t.Fatal("duplicate chat IDs accepted")
	}
	after, _ := r.chats()
	if before != after {
		t.Fatal("invalid restore was not rolled back")
	}
	backup.Chats = backup.Chats[:1]
	encoded, _ = json.Marshal(backup)
	if err := r.restore(string(encoded)); err != nil {
		t.Fatal(err)
	}
	after, _ = r.chats()
	var chats []struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal([]byte(after), &chats)
	if len(chats) != 1 || chats[0].ID != "new" {
		t.Fatal(after)
	}
}
