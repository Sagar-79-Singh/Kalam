import { useRef, useState } from 'react';
import { Download, FileJson, HardDrive, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { APP_NAME, APP_VERSION, BACKUP_VERSION } from '../../constants';
import { useApp, flushPersistence } from '../../store/app';
import { getBackup, isDesktop, restoreBackup } from '../../lib/db';
import { parseBackup } from '../../lib/backup';
import { downloadFile, errorMessage } from '../../lib/utils';
import { Button } from '../ui';

export function DataSettings() {
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const streaming = useApp(s => Boolean(s.streamingChatId));
  const backup = async () => {
    setBusy(true);
    try { await flushPersistence(); const data = await getBackup(); if (await downloadFile(`${APP_NAME.toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')) toast.success('Backup exported'); }
    catch (error) { toast.error('Backup failed', { description: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const restore = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > 150 * 1024 * 1024) throw new Error('Backup exceeds the 150 MB safety limit.');
      const data = parseBackup(await file.text());
      useApp.setState({ confirm: { title: 'Replace all local data?', description: `This validated version ${data.version} backup contains ${data.chats.length} chats, ${data.projects.length} projects, ${data.skills.length} skills, ${data.memories.length} memories, and ${data.connectors.length} connectors. Your current settings and data will be replaced, including saved keys. Export a backup first if you want to keep them.`, destructive: true, action: async () => {
        await flushPersistence();
        await restoreBackup(data);
        useApp.setState({ activeChatId: null, activeProjectId: undefined, artifactOpen: false, selectedArtifactId: undefined, promptDraft: '', lastSystemPrompt: '' });
        await useApp.getState().bootstrap();
        toast.success('Your workspace has been restored');
      } } });
    } catch (error) { toast.error('Backup could not be imported', { description: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  return <div className="space-y-6"><div><h3 className="section-title">Your thoughts belong to you.</h3><p className="mt-2 text-sm text-muted">Keep a copy. Move devices. Start fresh with your data intact.</p></div><div className="flex gap-3 rounded-xl border border-border bg-panel p-4"><HardDrive size={20} className="mt-0.5 shrink-0 text-accent" /><div><h4 className="text-sm font-medium">{isDesktop() ? 'Local-first desktop storage' : 'Standalone browser preview'}</h4><p className="mt-2 text-xs leading-[1.8] text-muted">{isDesktop() ? 'Chats, messages, artifact versions, and settings are stored in a local SQLite database in your system’s application configuration folder. Nothing is synced to a cloud account.' : 'This preview uses IndexedDB only for UI iteration. The installed desktop app uses the Go backend and local SQLite instead.'}</p></div></div><div className="rounded-xl border border-border bg-panel p-5"><div className="flex items-center gap-3"><FileJson size={22} strokeWidth={1.5} className="text-accent" /><h4 className="font-medium">One complete backup</h4></div><p className="my-4 text-xs leading-[1.8] text-muted">Includes settings, saved chats, artifact versions, project files, skills, memories, and connectors. Incognito conversations are never included. Backup format version: {BACKUP_VERSION}.</p><div className="flex flex-wrap gap-2"><Button busy={busy} disabled={busy || streaming} onClick={() => void backup()}><Download size={14} />Export backup</Button><Button disabled={busy || streaming} onClick={() => upload.current?.click()}><Upload size={14} />Restore backup</Button></div>{streaming && <p className="hint">Stop generation before backing up or restoring your workspace.</p>}<input ref={upload} type="file" accept="application/json,.json" className="hidden" aria-label="Import backup JSON" onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ''; }} /></div><div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" /><p className="text-xs leading-[1.8] text-muted"><strong className="font-medium text-fg">Keep backups private.</strong> They contain your conversations, API keys, and connector credentials in plain JSON. Store them somewhere you trust. Restore validates the schema before showing a confirmation, then replaces data in a single transaction.</p></div><div className="border-t border-border pt-5"><p className="font-display text-xl">{APP_NAME} <span className="font-sans text-xs text-muted">{APP_VERSION}</span></p><p className="mt-2 text-xs text-muted">A personal desktop workspace by Sagar-79-Singh.</p><p className="mt-1 text-xs text-muted">Powered exclusively by your OmniRoute gateway.</p></div></div>;
}
