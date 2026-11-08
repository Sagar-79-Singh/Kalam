import { useRef, useState } from 'react';
import { BookOpen, FileUp, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Skill } from '../../types';
import { useApp } from '../../store/app';
import { errorMessage, uid } from '../../lib/utils';
import { Button, EmptyState, Field, IconButton, Toggle } from '../ui';

export function SkillsSettings() {
  const state = useApp();
  const [draft, setDraft] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const create = () => setDraft({ id: uid(), name: '', description: '', instructions: '', enabled: true });
  const save = async () => {
    if (!draft) return;
    if (state.skills.some(skill => skill.id !== draft.id && skill.name.trim().toLowerCase() === draft.name.trim().toLowerCase())) { toast.error('Choose a unique skill name.'); return; }
    setSaving(true);
    try { await state.saveSkill({ ...draft, name: draft.name.trim(), description: draft.description.trim() }); setDraft(null); toast.success('Skill saved'); }
    catch (error) { toast.error('Could not save skill', { description: errorMessage(error) }); }
    finally { setSaving(false); }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 250_000) throw new Error('Keep skill files under 250 KB.');
      const text = await file.text(); const name = /^name:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1] ?? file.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
      const description = /^description:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1] ?? '';
      setDraft({ id: uid(), name, description, instructions: text, enabled: true });
    } catch (error) { toast.error(errorMessage(error)); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="section-title">A few useful superpowers.</h3><p className="mt-2 text-sm text-muted">Your own playbooks, ready when they’re relevant.</p></div><Button onClick={create}><Plus size={14} />Add skill</Button></div><p className="rounded-xl border border-border bg-panel p-4 text-xs leading-[1.8] text-muted">Only the name and description of enabled skills enter the system prompt. The model requests the full instructions when a task matches, keeping your context focused.</p>
    {draft && <div className="space-y-4 rounded-xl border border-accent/30 bg-panel p-4"><h4 className="flex items-center gap-2 text-sm font-medium"><Sparkles size={15} className="text-accent" />{state.skills.some(s => s.id === draft.id) ? 'Edit skill' : 'New skill'}</h4><Field label="Name"><input autoFocus className="input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="The name of your skill" /></Field><Field label="Description" hint="Tell the model when this skill is useful."><input className="input" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Use this when…" /></Field><Field label="Instructions · SKILL.md"><textarea spellCheck={false} className="input min-h-56 resize-y font-mono !text-xs leading-relaxed" value={draft.instructions} onChange={event => setDraft({ ...draft, instructions: event.target.value })} placeholder="# My skill\n\nExplain the approach, constraints, and desired output…" /></Field><div className="flex justify-end gap-2"><Button onClick={() => setDraft(null)}>Cancel</Button><Button primary disabled={saving || !draft.name.trim() || !draft.description.trim() || !draft.instructions.trim()} busy={saving} onClick={() => void save()}>Save skill</Button></div></div>}
    {!state.skills.length ? <EmptyState title="Share your way of doing things" icon={<BookOpen size={30} strokeWidth={1.2} />}>Add a writing guide, a coding convention,<br />or a method you return to again and again.</EmptyState> : <div className="space-y-3">{state.skills.map(skill => <div key={skill.id} className="rounded-xl border border-border bg-panel p-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-accent/10 p-2 text-accent"><BookOpen size={17} /></span><div className="min-w-0 flex-1"><h4 className="text-sm font-medium">{skill.name}</h4><p className="mt-1 text-xs leading-relaxed text-muted">{skill.description}</p></div><Toggle label={`Enable ${skill.name}`} value={skill.enabled} onChange={enabled => void state.saveSkill({ ...skill, enabled }).catch(error => toast.error(errorMessage(error)))} /></div><div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5"><span className="text-[10px] text-muted">{skill.instructions.length.toLocaleString()} characters · {skill.enabled ? 'available on demand' : 'disabled'}</span><div className="flex"><IconButton title={`Edit ${skill.name}`} className="!h-7 !w-7" onClick={() => setDraft(skill)}><Pencil size={13} /></IconButton><IconButton title={`Delete ${skill.name}`} className="!h-7 !w-7" onClick={() => useApp.setState({ confirm: { title: 'Delete this skill?', description: `“${skill.name}” will no longer be available to the model.`, destructive: true, action: () => state.removeSkill(skill.id) } })}><Trash2 size={13} /></IconButton></div></div></div>)}</div>}
    <input ref={upload} type="file" accept=".md,text/markdown,text/plain" className="hidden" aria-label="Import SKILL.md" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} /><Button onClick={() => upload.current?.click()}><FileUp size={14} />Import SKILL.md</Button>
  </div>;
}
