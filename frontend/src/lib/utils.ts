import { toast } from 'sonner';
import type { Chat } from '../types';
export const uid = () => crypto.randomUUID();
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
export const humanSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
export async function downloadFile(name: string, content: string, mime = 'text/plain'): Promise<boolean> {
  if (window.go?.main.App) return window.go.main.App.SaveExport(name, content);
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast.success('Copied to clipboard'); }
  catch { toast.error('Clipboard is unavailable. Select and copy the text instead.'); }
}
export function chatTitle(content: string): string { return content.trim().replace(/\s+/g, ' ').slice(0, 64) || 'New conversation'; }
export function makeChat(model: string, connectorIds: string[], projectId?: string, incognito = false): Chat {
  return { id: uid(), title: 'New conversation', model, createdAt: Date.now(), updatedAt: Date.now(), messages: [], artifacts: [], incognito, webSearch: false, connectorIds, projectId };
}
export function safeFilename(name: string): string { return name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 100) || 'export'; }
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (window.go?.main.App) await window.go.main.App.OpenExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
