import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_NAME, BACKUP_VERSION } from '../src/constants.ts';
import type { Backup, Chat } from '../src/types.ts';
import { defaultSettings, sampleSkills } from '../src/lib/defaults.ts';
import { parseBackup } from '../src/lib/backup.ts';
import { buildSystemPrompt } from '../src/lib/prompt.ts';

const empty = (): Backup => ({ app: APP_NAME, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: { ...defaultSettings, initialized: true }, chats: [], projects: [], skills: structuredClone(sampleSkills), connectors: [], memories: [] });
test('complete backups round-trip, malformed collections and settings are rejected', () => {
  const data = empty(); assert.deepEqual(parseBackup(JSON.stringify(data)), data);
  assert.throws(() => parseBackup('{broken'), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...data, version: 999 })), /supported/);
  assert.throws(() => parseBackup(JSON.stringify({ ...data, skills: [{ id: 'missing-fields' }] })), /description|name/);
  assert.throws(() => parseBackup(JSON.stringify({ ...data, memories: [{ id: 'a', content: 'x', createdAt: 1 }, { id: 'a', content: 'y', createdAt: 2 }] })), /unique IDs/);
  assert.throws(() => parseBackup(JSON.stringify({ ...data, settings: { ...data.settings, fontSize: 900 } })), /out-of-range/);
});
test('skills are advertised, never eagerly expanded; persona, style, and memories are assembled', () => {
  const state = empty();
  const prompt = buildSystemPrompt({ ...state, memories: [{ id: 'memory', content: 'Likes quiet mornings', createdAt: 1 }] });
  assert.ok(prompt.includes('Sagar'));
  assert.ok(prompt.includes('Likes quiet mornings'));
  assert.ok(prompt.includes('Clear writing:'));
  assert.ok(!prompt.includes(sampleSkills[0].instructions));
  assert.ok(!prompt.includes('Thought partner:'));
  assert.ok(prompt.includes('<artifact id='));
  assert.ok(prompt.includes('<memory>'));
});
test('incognito prompts do not recall or save memories', () => {
  const state = empty();
  const chat: Chat = { id: 'private', title: 'Private', model: '', createdAt: 1, updatedAt: 1, messages: [], artifacts: [], incognito: true, webSearch: false, connectorIds: [] };
  const prompt = buildSystemPrompt({ ...state, chat, memories: [{ id: 'memory', content: 'A private saved fact', createdAt: 1 }] });
  assert.ok(!prompt.includes('A private saved fact'));
  assert.ok(prompt.includes('Saving memories is disabled'));
  assert.ok(!prompt.includes('save_memory:'));
});
test('search failures are explicitly disclosed to the model', () => {
  const state = empty();
  const prompt = buildSystemPrompt({ ...state, search: { query: 'news', results: [], status: 'error', error: 'Endpoint offline' } });
  assert.ok(prompt.includes('WEB SEARCH UNAVAILABLE'));
  assert.ok(prompt.includes('Endpoint offline'));
});
