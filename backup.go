package main

import (
	"encoding/json"
	"errors"
	"fmt"
)

type backupDocument struct {
	Version    int               `json:"version"`
	App        string            `json:"app"`
	Settings   json.RawMessage   `json:"settings"`
	Chats      []json.RawMessage `json:"chats"`
	Skills     []json.RawMessage `json:"skills"`
	Memories   []json.RawMessage `json:"memories"`
	Connectors []json.RawMessage `json:"connectors"`
	Projects   []json.RawMessage `json:"projects"`
}

func (r *repository) restore(raw string) error {
	if len(raw) > 150*1024*1024 {
		return errors.New("backup exceeds the 150 MB safety limit")
	}
	var backup backupDocument
	if err := json.Unmarshal([]byte(raw), &backup); err != nil {
		return fmt.Errorf("invalid backup JSON: %w", err)
	}
	if backup.Version != 1 || backup.App != applicationName() {
		return errors.New("unsupported backup format or version")
	}
	if backup.Chats == nil || backup.Skills == nil || backup.Memories == nil || backup.Connectors == nil || backup.Projects == nil {
		return errors.New("backup is missing a collection")
	}
	if _, err := validObject(string(backup.Settings)); err != nil {
		return errors.New("invalid backup settings")
	}
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range []string{"chats", "skills", "memories", "connectors", "projects", "settings"} {
		if _, err := tx.Exec("DELETE FROM " + table); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("INSERT INTO settings(id,payload) VALUES(1,?)", string(backup.Settings)); err != nil {
		return err
	}
	for table, items := range map[string][]json.RawMessage{"skills": backup.Skills, "memories": backup.Memories, "connectors": backup.Connectors, "projects": backup.Projects} {
		seen := map[string]bool{}
		for _, item := range items {
			value, err := validObject(string(item))
			if err != nil {
				return err
			}
			id, err := documentID(value)
			if err != nil {
				return err
			}
			if seen[id] {
				return fmt.Errorf("duplicate id in %s", table)
			}
			seen[id] = true
			if err := saveEntity(tx, table, string(item)); err != nil {
				return err
			}
		}
	}
	seen := map[string]bool{}
	for _, chat := range backup.Chats {
		value, err := validObject(string(chat))
		if err != nil {
			return err
		}
		id, err := documentID(value)
		if err != nil {
			return err
		}
		if seen[id] {
			return errors.New("duplicate chat id")
		}
		seen[id] = true
		if err := saveChat(tx, string(chat)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
