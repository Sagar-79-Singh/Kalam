package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type repository struct{ db *sql.DB }
type executor interface {
	Exec(string, ...interface{}) (sql.Result, error)
}

var entityTables = map[string]bool{"skills": true, "memories": true, "connectors": true, "projects": true}

func openRepository(filename string) (*repository, error) {
	if err := os.MkdirAll(filepath.Dir(filename), 0o700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	_ = file.Close()
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	fail := func(err error) (*repository, error) { _ = db.Close(); return nil, err }
	for _, statement := range []string{
		"PRAGMA journal_mode=WAL", "PRAGMA foreign_keys=ON", "PRAGMA busy_timeout=5000",
		`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS messages (id TEXT NOT NULL, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(chat_id,id))`,
		`CREATE TABLE IF NOT EXISTS artifacts (id TEXT NOT NULL, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(chat_id,id))`,
		`CREATE INDEX IF NOT EXISTS messages_chat_position ON messages(chat_id,position)`,
		`CREATE INDEX IF NOT EXISTS artifacts_chat_position ON artifacts(chat_id,position)`,
		`CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
		"PRAGMA user_version=1",
	} {
		if _, err := db.Exec(statement); err != nil {
			return fail(fmt.Errorf("initialize local database: %w", err))
		}
	}
	return &repository{db: db}, nil
}
func (r *repository) settings() (string, error) {
	var payload string
	err := r.db.QueryRow("SELECT payload FROM settings WHERE id=1").Scan(&payload)
	if errors.Is(err, sql.ErrNoRows) {
		return "{}", nil
	}
	return payload, err
}
func (r *repository) saveSettings(raw string) error {
	if _, err := validObject(raw); err != nil {
		return err
	}
	_, err := r.db.Exec("INSERT INTO settings(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", raw)
	return err
}
func documentID(value map[string]json.RawMessage) (string, error) {
	var id string
	if err := json.Unmarshal(value["id"], &id); err != nil || id == "" || len(id) > 256 {
		return "", errors.New("document must have a valid id")
	}
	return id, nil
}
func saveEntity(target executor, table, raw string) error {
	if !entityTables[table] {
		return errors.New("invalid collection")
	}
	value, err := validObject(raw)
	if err != nil {
		return err
	}
	id, err := documentID(value)
	if err != nil {
		return err
	}
	_, err = target.Exec("INSERT INTO "+table+"(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", id, raw)
	return err
}
func (r *repository) save(table, raw string) error { return saveEntity(r.db, table, raw) }
func (r *repository) list(table string) (string, error) {
	if !entityTables[table] {
		return "", errors.New("invalid collection")
	}
	rows, err := r.db.Query("SELECT payload FROM " + table + " ORDER BY rowid")
	if err != nil {
		return "", err
	}
	defer rows.Close()
	result := []json.RawMessage{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return "", err
		}
		result = append(result, json.RawMessage(raw))
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	encoded, err := json.Marshal(result)
	return string(encoded), err
}
func (r *repository) remove(table, id string) error {
	if !entityTables[table] && table != "chats" {
		return errors.New("invalid collection")
	}
	_, err := r.db.Exec("DELETE FROM "+table+" WHERE id=?", id)
	return err
}
func saveChat(target executor, raw string) error {
	value, err := validObject(raw)
	if err != nil {
		return err
	}
	id, err := documentID(value)
	if err != nil {
		return err
	}
	var incognito bool
	_ = json.Unmarshal(value["incognito"], &incognito)
	if incognito {
		return errors.New("incognito conversations cannot be persisted")
	}
	var messages, artifacts []map[string]json.RawMessage
	if err := json.Unmarshal(value["messages"], &messages); err != nil {
		return errors.New("invalid chat messages")
	}
	if err := json.Unmarshal(value["artifacts"], &artifacts); err != nil {
		return errors.New("invalid chat artifacts")
	}
	delete(value, "messages")
	delete(value, "artifacts")
	header, _ := json.Marshal(value)
	if _, err = target.Exec("INSERT INTO chats(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", id, string(header)); err != nil {
		return err
	}
	for table, items := range map[string][]map[string]json.RawMessage{"messages": messages, "artifacts": artifacts} {
		if _, err := target.Exec("DELETE FROM "+table+" WHERE chat_id=?", id); err != nil {
			return err
		}
		for position, item := range items {
			itemID, err := documentID(item)
			if err != nil {
				return err
			}
			payload, _ := json.Marshal(item)
			if _, err := target.Exec("INSERT INTO "+table+"(id,chat_id,position,payload) VALUES(?,?,?,?)", itemID, id, position, string(payload)); err != nil {
				return err
			}
		}
	}
	return nil
}
func (r *repository) saveChat(raw string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := saveChat(tx, raw); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *repository) chats() (string, error) {
	rows, err := r.db.Query("SELECT payload FROM chats ORDER BY rowid DESC")
	if err != nil {
		return "", err
	}
	chats := []map[string]json.RawMessage{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			rows.Close()
			return "", err
		}
		value, err := validObject(raw)
		if err != nil {
			rows.Close()
			return "", err
		}
		chats = append(chats, value)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", err
	}
	for _, chat := range chats {
		id, _ := documentID(chat)
		for _, table := range []string{"messages", "artifacts"} {
			items := []json.RawMessage{}
			rows, err := r.db.Query("SELECT payload FROM "+table+" WHERE chat_id=? ORDER BY position", id)
			if err != nil {
				return "", err
			}
			for rows.Next() {
				var raw string
				if err := rows.Scan(&raw); err != nil {
					rows.Close()
					return "", err
				}
				items = append(items, json.RawMessage(raw))
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return "", err
			}
			chat[table], _ = json.Marshal(items)
		}
	}
	encoded, err := json.Marshal(chats)
	return string(encoded), err
}
func (r *repository) removeProject(id string) error {
	// Chats are retained as loose chats when a project is deleted.
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.Query("SELECT id,payload FROM chats")
	if err != nil {
		return err
	}
	type update struct{ id, payload string }
	updates := []update{}
	for rows.Next() {
		var chatID, raw string
		if err := rows.Scan(&chatID, &raw); err != nil {
			rows.Close()
			return err
		}
		value, err := validObject(raw)
		if err != nil {
			rows.Close()
			return err
		}
		var projectID string
		_ = json.Unmarshal(value["projectId"], &projectID)
		if projectID == id {
			delete(value, "projectId")
			encoded, _ := json.Marshal(value)
			updates = append(updates, update{chatID, string(encoded)})
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, item := range updates {
		if _, err := tx.Exec("UPDATE chats SET payload=? WHERE id=?", item.payload, item.id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("DELETE FROM projects WHERE id=?", id); err != nil {
		return err
	}
	return tx.Commit()
}
