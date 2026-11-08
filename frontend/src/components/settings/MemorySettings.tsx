import { useState } from 'react';
import { Brain, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Memory } from '../../types';
import { useApp } from '../../store/app';
import { errorMessage, uid } from '../../lib/utils';
import { Button, EmptyState, Field, IconButton, Toggle } from '../ui';

export function MemorySettings() {
  const state = useApp();
  const [editing, setEditing] = useState<Memory | null>(null);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState('');
  const save = async () => {
    if (!content.trim()) return;
    try { await state.saveMemory({ id: editing?.id ?? uid(), content: content.trim(), createdAt: editing?.createdAt ?? Date.now() }); setEditing(null); setAdding(false); setContent(''); toast.success('Memory saved'); }
    catch (error) { toast.error('Could not save memory', { description: errorMessage(error) }); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="section-title">The little things, remembered.</h3><p className="mt-2 text-sm text-muted">Useful context, always under your control.</p></div><Button onClick={() => { setAdding(true); setEditing(null); setContent(''); }}><Plus size={14} />Add memory</Button></div><div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-panel p-4"><div><h4 className="text-sm font-medium">Remember useful details</h4><p className="mt-1 text-xs leading-relaxed text-muted">Saved facts are included in future chats. Incognito chats neither use nor save memories.</p></div><Toggle label="Enable memory" value={state.settings.memoryEnabled} onChange={memoryEnabled => void state.updateSettings({ memoryEnabled }).catch(() => undefined)} /></div>
    {(adding || editing) && <div className="rounded-xl border border-accent/30 bg-panel p-4"><Field label={editing ? 'Edit memory' : 'A detail worth keeping'}><textarea autoFocus className="input min-h-24 resize-y" value={content} maxLength={2000} onChange={event => setContent(event.target.value)} placeholder="Something you’d like remembered…" /></Field><div className="mt-3 flex justify-end gap-2"><Button onClick={() => { setAdding(false); setEditing(null); }}><X size={13} />Cancel</Button><Button primary disabled={!content.trim()} onClick={() => void save()}><Check size={13} />Save memory</Button></div></div>}
    {!state.memories.length ? <EmptyState title="Getting to know you, one thought at a time" icon={<Brain size={32} strokeWidth={1.2} />}>When you share something useful about yourself,<br />it can be remembered for next time.</EmptyState> : <div className="space-y-2">{state.memories.map(memory => <div key={memory.id} className="flex items-start gap-3 rounded-xl border border-border bg-panel p-4"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" /><div className="min-w-0 flex-1"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{memory.content}</p><p className="mt-2 text-[10px] text-muted">{new Date(memory.createdAt).toLocaleDateString()}</p></div><div className="flex"><IconButton title="Edit memory" className="!h-7 !w-7" onClick={() => { setEditing(memory); setAdding(false); setContent(memory.content); }}><Pencil size={13} /></IconButton><IconButton title="Delete memory" className="!h-7 !w-7" onClick={() => useApp.setState({ confirm: { title: 'Forget this memory?', description: memory.content, destructive: true, action: () => state.removeMemory(memory.id) } })}><Trash2 size={13} /></IconButton></div></div>)}</div>}
    <p className="text-xs leading-relaxed text-muted">You can edit or remove anything here. Disabling memory keeps saved facts on this device but excludes them from prompts and prevents new saves. Memories may still appear in older chat messages or backups.</p>
  </div>;
}
