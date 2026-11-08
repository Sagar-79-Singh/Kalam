import { useState } from 'react';
import { Copy, Eye, FileText, Volume2 } from 'lucide-react';
import type { ResponseStyle } from '../../types';
import { activeChat, createDraftChat, useApp } from '../../store/app';
import { buildSystemPrompt } from '../../lib/prompt';
import { copyText } from '../../lib/utils';
import { canSpeak } from '../../lib/voice';
import { Field, IconButton, Toggle } from '../ui';

export function PersonalizationSettings() {
  const state = useApp();
  const [preview, setPreview] = useState<'current' | 'last'>('current');
  const chat = activeChat() ?? createDraftChat();
  const search = chat.messages.findLast(message => message.search)?.search;
  const prompt = buildSystemPrompt({ ...state, chat, project: state.projects.find(project => project.id === chat.projectId), search });
  const text = preview === 'last' ? state.lastSystemPrompt || 'No request has been sent in this session yet.' : prompt;
  const save = (patch: Parameters<typeof state.updateSettings>[0]) => { void state.updateSettings(patch).catch(() => undefined); };
  const styles: Array<{ id: ResponseStyle; title: string; description: string }> = [
    { id: 'normal', title: 'Normal', description: 'A thoughtful balance' },
    { id: 'concise', title: 'Concise', description: 'Straight to the point' },
    { id: 'explanatory', title: 'Explanatory', description: 'A little more depth' },
    { id: 'casual', title: 'Casual', description: 'Keep it conversational' }
  ];
  return <div className="space-y-6"><div><h3 className="section-title">Make this space yours.</h3><p className="mt-2 text-sm text-muted">A few details that make every conversation feel more like you.</p></div><Field label="What should I call you?"><input data-autofocus className="input" value={state.settings.name} onChange={event => save({ name: event.target.value })} placeholder="Your name" /></Field><Field label="About you" hint="Your interests, work, or anything you’d like your assistant to know."><textarea className="input min-h-24 resize-y" value={state.settings.about} onChange={event => save({ about: event.target.value })} placeholder="A little context goes a long way…" /></Field><Field label="Custom instructions" hint="Applied to every conversation, together with any project instructions."><textarea className="input min-h-32 resize-y" value={state.settings.customInstructions} onChange={event => save({ customInstructions: event.target.value })} placeholder="How would you like me to respond?" /></Field><Field label="Response style"><div className="grid grid-cols-2 gap-2">{styles.map(style => <button key={style.id} aria-pressed={state.settings.responseStyle === style.id} onClick={() => save({ responseStyle: style.id })} className={`rounded-xl border px-4 py-3 text-left transition-colors ${state.settings.responseStyle === style.id ? 'border-accent bg-accent/5' : 'border-border bg-panel hover:bg-surface/50'}`}><span className="block text-sm font-medium">{style.title}</span><span className="mt-1 block text-[11px] text-muted">{style.description}</span></button>)}</div></Field><div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-panel p-4"><div><h4 className="flex items-center gap-2 text-sm font-medium"><Volume2 size={16} />Read replies aloud</h4><p className="mt-1 text-xs text-muted">{canSpeak() ? 'Use your system’s voice after each reply.' : 'Not supported by this system webview.'}</p></div><Toggle label="Read replies aloud" disabled={!canSpeak()} value={state.settings.readAloud} onChange={value => save({ readAloud: value })} /></div>
    <div className="overflow-hidden rounded-xl border border-border"><div className="flex flex-wrap items-center justify-between gap-2 bg-surface/40 px-4 py-3"><h4 className="flex items-center gap-2 text-xs font-medium"><Eye size={15} />System Prompt Preview</h4><div className="flex items-center gap-2"><select aria-label="Prompt preview source" className="rounded border border-border bg-panel px-2 py-1 text-[11px]" value={preview} onChange={event => setPreview(event.target.value as 'current' | 'last')}><option value="current">Live assembled prompt</option><option value="last">Last request (exact)</option></select><IconButton title="Copy system prompt" className="!h-6 !w-6" onClick={() => void copyText(text)}><Copy size={12} /></IconButton></div></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-panel p-4 font-mono text-[11px] leading-[1.8] text-muted">{text}</pre><p className="flex items-start gap-2 border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted"><FileText size={12} className="mt-0.5 shrink-0" />The live prompt includes this chat’s project, memories, skill catalogue, tools, and artifact rules. Full skill instructions are loaded only on demand. Settings save automatically.</p></div>
  </div>;
}
