import { APP_NAME, BACKUP_VERSION } from '../constants';
import type { Backup, Chat, Connector, Memory, Project, Settings, Skill } from '../types';
import { defaultSettings, sampleSkills } from './defaults';

type Store = 'settings' | 'chats' | 'skills' | 'memories' | 'connectors' | 'projects';
const stores: Store[] = ['settings', 'chats', 'skills', 'memories', 'connectors', 'projects'];
let opening: Promise<IDBDatabase> | undefined;
const native = () => window.go?.main.App;
export const isDesktop = () => Boolean(native());

function openBrowserDB(): Promise<IDBDatabase> {
  return opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(`${APP_NAME.toLowerCase()}-preview`, 1);
    request.onupgradeneeded = () => stores.forEach(name => request.result.createObjectStore(name, { keyPath: 'id' }));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local storage. Please allow storage for this window.'));
  });
}
async function readAll<T>(store: Store): Promise<T[]> {
  const db = await openBrowserDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}
async function write(store: Store, value: object | string, remove = false): Promise<void> {
  const db = await openBrowserDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    if (remove) objectStore.delete(value as string); else objectStore.put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction was cancelled.'));
  });
}
const decode = <T,>(value: string): T[] => (JSON.parse(value || '[]') ?? []) as T[];
export async function getSettings(): Promise<Settings> {
  const bridge = native();
  const saved: Partial<Settings> = bridge ? JSON.parse(await bridge.GetSettings()) : (await readAll<{ id: string; value: Settings }>('settings'))[0]?.value ?? {};
  return { ...defaultSettings, ...saved };
}
export async function putSettings(value: Settings): Promise<void> {
  const bridge = native();
  if (bridge) await bridge.PutSettings(JSON.stringify(value));
  else await write('settings', { id: 'main', value });
}
export async function getChats(): Promise<Chat[]> { const b = native(); return b ? decode<Chat>(await b.GetChats()) : readAll<Chat>('chats'); }
export async function putChat(value: Chat): Promise<void> { if (value.incognito) return; const b = native(); if (b) await b.PutChat(JSON.stringify(value)); else await write('chats', value); }
export async function deleteChat(id: string): Promise<void> { const b = native(); if (b) await b.DeleteChat(id); else await write('chats', id, true); }
export async function getSkills(): Promise<Skill[]> { const b = native(); return b ? decode<Skill>(await b.GetSkills()) : readAll<Skill>('skills'); }
export async function putSkill(value: Skill): Promise<void> { const b = native(); if (b) await b.PutSkill(JSON.stringify(value)); else await write('skills', value); }
export async function deleteSkill(id: string): Promise<void> { const b = native(); if (b) await b.DeleteSkill(id); else await write('skills', id, true); }
export async function getMemories(): Promise<Memory[]> { const b = native(); return b ? decode<Memory>(await b.GetMemories()) : readAll<Memory>('memories'); }
export async function putMemory(value: Memory): Promise<void> { const b = native(); if (b) await b.PutMemory(JSON.stringify(value)); else await write('memories', value); }
export async function deleteMemory(id: string): Promise<void> { const b = native(); if (b) await b.DeleteMemory(id); else await write('memories', id, true); }
export async function getConnectors(): Promise<Connector[]> { const b = native(); return b ? decode<Connector>(await b.GetConnectors()) : readAll<Connector>('connectors'); }
export async function putConnector(value: Connector): Promise<void> { const b = native(); if (b) await b.PutConnector(JSON.stringify(value)); else await write('connectors', value); }
export async function deleteConnector(id: string): Promise<void> { const b = native(); if (b) await b.DeleteConnector(id); else await write('connectors', id, true); }
export async function getProjects(): Promise<Project[]> { const b = native(); return b ? decode<Project>(await b.GetProjects()) : readAll<Project>('projects'); }
export async function putProject(value: Project): Promise<void> { const b = native(); if (b) await b.PutProject(JSON.stringify(value)); else await write('projects', value); }
export async function deleteProject(id: string): Promise<void> { const b = native(); if (b) await b.DeleteProject(id); else await write('projects', id, true); }

export async function initialize(): Promise<Backup> {
  const settings = await getSettings();
  if (!settings.initialized) {
    for (const skill of sampleSkills) await putSkill(skill);
    settings.initialized = true;
    await putSettings(settings);
  }
  return getBackup();
}
export async function getBackup(): Promise<Backup> {
  const [settings, chats, skills, memories, connectors, projects] = await Promise.all([getSettings(), getChats(), getSkills(), getMemories(), getConnectors(), getProjects()]);
  return { version: BACKUP_VERSION, app: APP_NAME, exportedAt: new Date().toISOString(), settings, chats: chats.filter(c => !c.incognito), skills, memories, connectors, projects };
}
export async function restoreBackup(backup: Backup): Promise<void> {
  const b = native();
  if (b) return b.RestoreBackup(JSON.stringify(backup));
  const db = await openBrowserDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    stores.forEach(name => transaction.objectStore(name).clear());
    transaction.objectStore('settings').put({ id: 'main', value: backup.settings });
    for (const name of stores.filter((s): s is Exclude<Store, 'settings'> => s !== 'settings')) {
      for (const item of backup[name]) transaction.objectStore(name).put(item);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Restore cancelled. Nothing was changed.'));
  });
}
