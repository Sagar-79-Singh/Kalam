import { create } from 'zustand';
import { toast } from 'sonner';
import type { Artifact, Attachment, Chat, Connector, Memory, Project, Settings, Skill } from '../types';
import * as db from '../lib/db';
import { defaultSettings } from '../lib/defaults';
import { applyTheme } from '../lib/theme';
import { stopSpeaking } from '../lib/voice';
import { errorMessage, makeChat, uid } from '../lib/utils';

export type SettingsTab = 'connection' | 'personalization' | 'appearance' | 'skills' | 'connectors' | 'memory' | 'data';
interface AppState {
  ready: boolean; loadingError: string; settings: Settings;
  chats: Chat[]; projects: Project[]; skills: Skill[]; memories: Memory[]; connectors: Connector[];
  activeChatId: string | null; activeProjectId?: string;
  sidebarOpen: boolean; artifactOpen: boolean; selectedArtifactId?: string;
  settingsTab: SettingsTab | null; searchOpen: boolean; shortcutsOpen: boolean; projectEditorId: string | null;
  draftIncognito: boolean; draftSearch: boolean; draftConnectorIds: string[]; promptDraft: string;
  abortController: AbortController | null; streamingChatId: string | null; streamingMessageId: string | null;
  lastSystemPrompt: string;
  confirm: { title: string; description: string; action: () => Promise<void>; destructive?: boolean } | null;
  bootstrap(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateChat(chat: Chat, persist?: boolean): void;
  saveChat(id: string): Promise<void>;
  selectChat(id: string): void;
  newChat(projectId?: string, incognito?: boolean): void;
  removeChat(id: string): Promise<void>;
  renameChat(id: string, title: string): void;
  branchChat(chatId: string, messageId: string): void;
  saveSkill(skill: Skill): Promise<void>; removeSkill(id: string): Promise<void>;
  saveMemory(memory: Memory): Promise<void>; removeMemory(id: string): Promise<void>;
  saveConnector(connector: Connector): Promise<void>; removeConnector(id: string): Promise<void>;
  saveProject(project: Project): Promise<void>; removeProject(id: string): Promise<void>;
  updateArtifact(artifact: Artifact): void;
  stop(): void;
  setPrompt(content: string, attachments?: Attachment[]): void;
}
const saves = new Map<string, Promise<void>>();
let settingsSave: Promise<void> = Promise.resolve();
const replace = <T extends { id: string }>(items: T[], item: T): T[] => items.some(i => i.id === item.id) ? items.map(i => i.id === item.id ? item : i) : [...items, item];

export const useApp = create<AppState>((set, get) => ({
  ready: false, loadingError: '', settings: { ...defaultSettings, ...window.__KALAM_BOOTSTRAP__ },
  chats: [], projects: [], skills: [], memories: [], connectors: [], activeChatId: null,
  sidebarOpen: window.innerWidth >= 1000, artifactOpen: false, settingsTab: null, searchOpen: false, shortcutsOpen: false,
  projectEditorId: null, draftIncognito: false, draftSearch: false, draftConnectorIds: [], promptDraft: '',
  abortController: null, streamingChatId: null, streamingMessageId: null, lastSystemPrompt: '', confirm: null,
  async bootstrap() {
    try {
      const data = await db.initialize();
      applyTheme(data.settings);
      set({ settings: data.settings, chats: data.chats.sort((a, b) => b.updatedAt - a.updatedAt), projects: data.projects, skills: data.skills, memories: data.memories, connectors: data.connectors, draftConnectorIds: data.connectors.filter(c => c.enabled).map(c => c.id), ready: true, loadingError: '' });
    } catch (error) { set({ loadingError: errorMessage(error), ready: true }); toast.error('Could not load local data', { description: errorMessage(error) }); }
  },
  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch }; set({ settings }); applyTheme(settings);
    settingsSave = settingsSave.catch(() => undefined).then(() => db.putSettings(settings));
    try { await settingsSave; } catch (error) { toast.error('Settings could not be saved', { description: errorMessage(error) }); throw error; }
  },
  updateChat(chat, persist = true) {
    set(state => ({ chats: replace(state.chats, chat) }));
    if (persist) void get().saveChat(chat.id);
  },
  async saveChat(id) {
    const chat = get().chats.find(c => c.id === id); if (!chat || chat.incognito) return;
    const pending = (saves.get(id) ?? Promise.resolve()).catch(() => undefined).then(() => db.putChat(chat));
    saves.set(id, pending);
    try { await pending; } catch (error) { toast.error('Conversation could not be saved', { description: errorMessage(error) }); }
    finally { if (saves.get(id) === pending) saves.delete(id); }
  },
  selectChat(id) {
    if (get().activeChatId !== id) get().stop();
    const chat = get().chats.find(c => c.id === id);
    if (chat?.model && chat.model !== get().settings.model) void get().updateSettings({ model: chat.model }).catch(() => undefined);
    set({ activeChatId: id, activeProjectId: chat?.projectId, selectedArtifactId: chat?.artifacts.at(-1)?.id, artifactOpen: false, promptDraft: '' });
    if (window.innerWidth < 1000) set({ sidebarOpen: false });
  },
  newChat(projectId, incognito = false) {
    get().stop();
    set({ chats: get().chats.filter(c => !c.incognito), activeChatId: null, activeProjectId: projectId, artifactOpen: false, selectedArtifactId: undefined, draftIncognito: incognito, draftSearch: false, draftConnectorIds: get().connectors.filter(c => c.enabled).map(c => c.id), promptDraft: '', lastSystemPrompt: '' });
    if (window.innerWidth < 1000) set({ sidebarOpen: false });
  },
  async removeChat(id) {
    if (get().activeChatId === id) { get().stop(); set({ activeChatId: null, artifactOpen: false }); }
    set(state => ({ chats: state.chats.filter(c => c.id !== id) }));
    await saves.get(id)?.catch(() => undefined); await db.deleteChat(id);
  },
  renameChat(id, title) {
    const chat = get().chats.find(c => c.id === id); if (chat && title.trim()) get().updateChat({ ...chat, title: title.trim(), updatedAt: Date.now() });
  },
  branchChat(chatId, messageId) {
    get().stop(); const source = get().chats.find(c => c.id === chatId); if (!source) return;
    const end = source.messages.findIndex(m => m.id === messageId); if (end < 0) return;
    const chat = makeChat(source.model, source.connectorIds, source.projectId, source.incognito);
    chat.title = `${source.title} (branch)`; chat.branchedFrom = source.id; chat.webSearch = source.webSearch;
    chat.messages = structuredClone(source.messages.slice(0, end + 1));
    const ids = new Set(chat.messages.map(m => m.id));
    chat.artifacts = structuredClone(source.artifacts).flatMap(a => { const versions = a.versions.filter(v => !v.messageId || ids.has(v.messageId)).map((v, index) => ({ ...v, number: index + 1 })); return versions.length ? [{ ...a, chatId: chat.id, versions, activeVersionId: versions.at(-1)!.id }] : []; });
    get().updateChat(chat); get().selectChat(chat.id); toast.success('New branch created');
  },
  async saveSkill(skill) { await db.putSkill(skill); set(state => ({ skills: replace(state.skills, skill) })); },
  async removeSkill(id) { await db.deleteSkill(id); set(state => ({ skills: state.skills.filter(s => s.id !== id) })); },
  async saveMemory(memory) { await db.putMemory(memory); set(state => ({ memories: replace(state.memories, memory) })); },
  async removeMemory(id) { await db.deleteMemory(id); set(state => ({ memories: state.memories.filter(m => m.id !== id) })); },
  async saveConnector(connector) {
    await db.putConnector(connector);
    set(state => ({ connectors: replace(state.connectors, connector), draftConnectorIds: !state.connectors.some(c => c.id === connector.id) && connector.enabled ? [...state.draftConnectorIds, connector.id] : state.draftConnectorIds }));
  },
  async removeConnector(id) {
    await db.deleteConnector(id); set(state => ({ connectors: state.connectors.filter(c => c.id !== id), draftConnectorIds: state.draftConnectorIds.filter(value => value !== id) }));
    for (const chat of get().chats.filter(c => c.connectorIds.includes(id))) get().updateChat({ ...chat, connectorIds: chat.connectorIds.filter(value => value !== id) });
  },
  async saveProject(project) { await db.putProject(project); set(state => ({ projects: replace(state.projects, project) })); },
  async removeProject(id) {
    await db.deleteProject(id); set(state => ({ projects: state.projects.filter(p => p.id !== id), activeProjectId: state.activeProjectId === id ? undefined : state.activeProjectId }));
    for (const chat of get().chats.filter(c => c.projectId === id)) { const updated = { ...chat }; delete updated.projectId; get().updateChat(updated); }
  },
  updateArtifact(artifact) { const chat = get().chats.find(c => c.id === artifact.chatId); if (chat) get().updateChat({ ...chat, artifacts: replace(chat.artifacts, artifact) }); },
  stop() { get().abortController?.abort(); stopSpeaking(); },
  setPrompt(content) { set({ promptDraft: content }); document.getElementById('composer-input')?.focus(); }
}));
export async function flushPersistence(): Promise<void> { await Promise.all([...saves.values(), settingsSave]); }
export function activeChat(): Chat | undefined { const state = useApp.getState(); return state.chats.find(c => c.id === state.activeChatId); }
export function createDraftChat(): Chat {
  const s = useApp.getState();
  const chat = makeChat(s.settings.model, s.draftConnectorIds, s.activeProjectId, s.draftIncognito);
  chat.webSearch = s.draftSearch; return chat;
}
export function newManualArtifact(type: Artifact['type'], title: string, code: string): void {
  const state = useApp.getState(); const chat = activeChat() ?? createDraftChat();
  const id = uid(); const versionId = uid();
  chat.artifacts = [...chat.artifacts, { id, chatId: chat.id, type, title: title.trim() || 'Untitled artifact', activeVersionId: versionId, versions: [{ id: versionId, number: 1, code, createdAt: Date.now() }] }];
  if (!chat.messages.length && chat.title === 'New conversation') chat.title = title.trim() || 'Untitled artifact';
  state.updateChat({ ...chat }); useApp.setState({ activeChatId: chat.id, selectedArtifactId: id, artifactOpen: true });
}
