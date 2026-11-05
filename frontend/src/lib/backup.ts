import { APP_NAME, BACKUP_VERSION } from '../constants.ts';
import type { Backup } from '../types.ts';

type Check = (value: unknown, path: string) => void;
const fail = (path: string, expected: string): never => { throw new Error(`Invalid backup at ${path}: expected ${expected}.`); };
const text: Check = (value, path) => { if (typeof value !== 'string') fail(path, 'text'); };
const number: Check = (value, path) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(path, 'a non-negative number'); };
const bool: Check = (value, path) => { if (typeof value !== 'boolean') fail(path, 'true or false'); };
const record: Check = (value, path) => { if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'an object'); };
const optional = (check: Check): Check => (value, path) => { if (value !== undefined) check(value, path); };
const choices = (...values: readonly string[]): Check => (value, path) => { if (typeof value !== 'string' || !values.includes(value)) fail(path, values.join(' / ')); };
const object = (fields: Record<string, Check>): Check => (value, path) => {
  record(value, path);
  const data = value as Record<string, unknown>;
  for (const [key, check] of Object.entries(fields)) check(data[key], `${path}.${key}`);
};
const list = (check: Check, unique = false): Check => (value, path) => {
  if (!Array.isArray(value)) fail(path, 'an array');
  const ids = new Set<string>();
  for (const [index, item] of (value as unknown[]).entries()) {
    check(item, `${path}[${index}]`);
    if (unique) { const id = (item as { id: string }).id; if (ids.has(id)) fail(path, 'unique IDs'); ids.add(id); }
  }
};
const id: Check = (value, path) => { text(value, path); if (!(value as string).length || (value as string).length > 256) fail(path, 'an ID with 1–256 characters'); };
const attachment = object({ id, name: text, mime: text, size: number, text: optional(text), dataUrl: optional((value, path) => { if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(value)) fail(path, 'a supported base64 image'); }) });
const toolDefinition = object({ name: text, description: optional(text), inputSchema: record });
const toolCall = object({ id, name: text, arguments: record, kind: choices('connector', 'skill', 'memory'), connectorId: optional(id), native: optional(bool), status: choices('pending', 'running', 'complete', 'error'), result: optional(text), error: optional(text) });
const search = object({ query: text, status: choices('running', 'complete', 'error'), error: optional(text), results: list(object({ title: text, url: text, snippet: text })) });
const message = object({ id, role: choices('user', 'assistant', 'tool'), content: text, createdAt: number, attachments: list(attachment, true), toolCalls: optional(list(toolCall, true)), toolCallId: optional(text), search: optional(search), error: optional(text), stopped: optional(bool) });
const version = object({ id, number, code: text, createdAt: number, messageId: optional(text) });
const artifact = object({ id, chatId: id, title: text, type: choices('html', 'react', 'svg', 'mermaid', 'markdown'), versions: list(version, true), activeVersionId: id });
const settings = object({ initialized: bool, baseUrl: text, apiKey: text, model: text, apiFormat: choices('auto', 'messages', 'chat'), toolMode: choices('tags', 'native'), maxTokens: number, name: text, about: text, customInstructions: text, responseStyle: choices('normal', 'concise', 'explanatory', 'casual'), theme: choices('light', 'dark', 'system'), font: choices('inter', 'serif', 'mono', 'dyslexic'), fontSize: number, readAloud: bool, searchEndpoint: text, searchApiKey: text, searchMethod: choices('GET', 'POST'), memoryEnabled: bool });
const chat = object({ id, title: text, createdAt: number, updatedAt: number, messages: list(message, true), artifacts: list(artifact, true), projectId: optional(id), incognito: bool, webSearch: bool, connectorIds: list(id), model: text, branchedFrom: optional(id) });
const schema = object({ version: number, app: text, exportedAt: text, settings, chats: list(chat, true), skills: list(object({ id, name: text, description: text, instructions: text, enabled: bool }), true), memories: list(object({ id, content: text, createdAt: number }), true), connectors: list(object({ id, name: text, url: text, authHeader: text, authValue: text, enabled: bool, tools: list(toolDefinition), lastTested: optional(number) }), true), projects: list(object({ id, name: text, icon: text, description: text, instructions: text, files: list(attachment, true), createdAt: number }), true) });

/** Validate the entire document before either the browser or native store is touched. */
export function parseBackup(raw: string): Backup {
  if (raw.length > 150 * 1024 * 1024) throw new Error('Backup exceeds the 150 MB safety limit.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  schema(value, 'backup');
  const backup = value as Backup;
  if (backup.app !== APP_NAME || backup.version !== BACKUP_VERSION) throw new Error(`This is not a supported ${APP_NAME} backup (version ${BACKUP_VERSION}).`);
  if (!Number.isFinite(Date.parse(backup.exportedAt))) throw new Error('The backup export date is invalid.');
  if (backup.settings.fontSize < 13 || backup.settings.fontSize > 24 || backup.settings.maxTokens < 256 || backup.settings.maxTokens > 131072) throw new Error('Backup contains out-of-range appearance or response settings.');
  const projects = new Set(backup.projects.map(project => project.id));
  for (const item of backup.chats) {
    if (item.incognito) throw new Error('Incognito chats cannot be imported into persistent history.');
    if (item.projectId && !projects.has(item.projectId)) throw new Error(`Chat “${item.title}” refers to a missing project.`);
    for (const a of item.artifacts) {
      if (a.chatId !== item.id || !a.versions.length || !a.versions.some(v => v.id === a.activeVersionId)) throw new Error(`Artifact “${a.title}” has invalid chat or version references.`);
      if (a.versions.some((v, index) => v.number !== index + 1)) throw new Error(`Artifact “${a.title}” has invalid version numbers.`);
    }
  }
  return backup;
}
