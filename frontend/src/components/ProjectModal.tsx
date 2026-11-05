import { useRef, useState } from 'react';
import { Folder, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '../types';
import { useApp } from '../store/app';
import { readAttachment } from '../lib/files';
import { errorMessage, uid } from '../lib/utils';
import { FileChips } from './FileChips';
import { Modal } from './Modal';
import { Button, Field } from './ui';

const icons = ['📁', '🌱', '✍️', '💻', '🎨', '🔬', '📚', '🧭', '🚀', '🎯', '🪴', '💡', '🎵', '☕', '🏡', '🌏'];
export function ProjectModal() {
  const state = useApp();
  const id = state.projectEditorId;
  if (!id) return null;
  return <ProjectEditor key={id} project={state.projects.find(project => project.id === id)} onClose={() => useApp.setState({ projectEditorId: null })} />;
}
function ProjectEditor({ project, onClose }: { project?: Project; onClose: () => void }) {
  const state = useApp();
  const [draft, setDraft] = useState<Project>(project ?? { id: uid(), name: '', description: '', icon: '📁', instructions: '', files: [], createdAt: Date.now() });
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const save = async () => {
    setSaving(true);
    try { await state.saveProject({ ...draft, name: draft.name.trim() }); if (!project) state.newChat(draft.id); onClose(); toast.success(project ? 'Project updated' : 'Project created'); }
    catch (error) { toast.error('Could not save project', { description: errorMessage(error) }); }
    finally { setSaving(false); }
  };
  const attach = async (list: File[]) => {
    if (list.length + draft.files.length > 20) { toast.error('A project can hold up to 20 reference files.'); return; }
    setReading(true);
    for (const file of list) {
      try { const attachment = await readAttachment(file); setDraft(current => ({ ...current, files: [...current.files, attachment] })); }
      catch (error) { toast.error(errorMessage(error)); }
    }
    setReading(false);
  };
  return <Modal title={project ? 'Your project' : 'A home for a bigger idea'} onClose={onClose} className="max-w-2xl"><div className="space-y-5 overflow-y-auto p-5 sm:p-6"><div className="flex items-start gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-panel text-3xl">{draft.icon}</span><div className="flex-1"><Field label="Project name"><input data-autofocus className="input" placeholder="What are you working on?" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field></div></div><Field label="Choose an icon"><div className="flex flex-wrap gap-1.5">{icons.map(icon => <button key={icon} aria-label={`Use ${icon} icon`} aria-pressed={draft.icon === icon} onClick={() => setDraft({ ...draft, icon })} className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xl ${draft.icon === icon ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface'}`}>{icon}</button>)}</div><input aria-label="Custom project emoji" className="input mt-2 max-w-40 !text-xs" placeholder="Or type your own emoji" value={draft.icon} maxLength={12} onChange={event => setDraft({ ...draft, icon: event.target.value })} /></Field><Field label="Description"><input className="input" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="A few words about this project" /></Field><Field label="Project instructions" hint="Applied to every conversation in this project, alongside your personal instructions."><textarea className="input min-h-32 resize-y" value={draft.instructions} onChange={event => setDraft({ ...draft, instructions: event.target.value })} placeholder="The context, goals, or guidelines that matter here…" /></Field><Field label="Reference files" hint="Text and PDFs are extracted locally. Images are sent as vision input. Up to 20 files, 15 MB each."><div className="space-y-3" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void attach(Array.from(event.dataTransfer.files)); }}><FileChips files={draft.files} onRemove={fileId => setDraft({ ...draft, files: draft.files.filter(file => file.id !== fileId) })} /><Button disabled={reading} onClick={() => input.current?.click()}>{reading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}{reading ? 'Reading files…' : 'Add files or drop them here'}</Button><input ref={input} type="file" multiple className="hidden" aria-label="Upload project files" onChange={event => { void attach(Array.from(event.target.files || [])); event.target.value = ''; }} /></div></Field></div><div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-4">{project ? <Button danger onClick={() => useApp.setState({ confirm: { title: 'Delete this project?', description: `“${project.name}” and its reference files will be removed. Its chats will be kept as ordinary conversations.`, destructive: true, action: async () => { await state.removeProject(project.id); onClose(); } } })}><Trash2 size={13} />Delete project</Button> : <Folder size={18} className="text-muted/50" />}<div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button primary busy={saving} disabled={saving || reading || !draft.name.trim() || !draft.icon.trim()} onClick={() => void save()}>{project ? 'Save project' : 'Create project'}</Button></div></div></Modal>;
}
