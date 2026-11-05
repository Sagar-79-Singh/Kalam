import { ArrowUpRight, Code2, Feather, Lightbulb, LockKeyhole, MessageCircle, Paperclip } from 'lucide-react';
import { useApp } from '../store/app';
import { BrandMark } from './Brand';
import { Composer } from './Composer';

const starters = [
  { icon: Code2, title: 'Make something', description: 'Give an idea a little life', prompt: 'Help me create a polished, interactive artifact. Ask me what I would like to build.' },
  { icon: Feather, title: 'Find the words', description: 'A first draft, a fresh voice', prompt: 'I’d like help writing something. Ask me about the audience, the purpose, and the voice I have in mind.' },
  { icon: Lightbulb, title: 'Explore an idea', description: 'Follow your curiosity', prompt: 'Let’s explore an idea together. Ask me what I’m curious about and help me see it from a fresh perspective.' },
  { icon: MessageCircle, title: 'Think it through', description: 'Untangle something tricky', prompt: 'Be my thought partner. Help me work through a decision or a tricky problem, starting with a question about what’s on my mind.' }
];
export function Welcome() {
  const state = useApp();
  const project = state.projects.find(p => p.id === state.activeProjectId);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <div className="flex min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex w-full max-w-[880px] flex-col justify-center px-5 pb-12 pt-8 sm:px-10 sm:pb-24">
    <div className="mb-9 animate-fade-up text-center sm:mb-10">{project ? <><span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-panel text-3xl">{project.icon}</span><h1 className="font-display text-[36px] leading-tight tracking-[-1.2px] sm:text-[44px]">{project.name}</h1><p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted">{project.description || 'A little focus for your next big idea.'}</p><button onClick={() => useApp.setState({ projectEditorId: project.id })} className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] text-muted hover:bg-fg/5"><Paperclip size={12} />{project.files.length} reference files · project instructions<ArrowUpRight size={12} /></button></> : <><div className="mb-5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted/75">{state.draftIncognito ? <><LockKeyhole size={12} />A little off the record</> : <>Your personal thinking space</>}</div><div className="mb-5 flex justify-center text-accent"><BrandMark className="h-11 w-11" /></div><h1 className="font-display text-[34px] leading-[1.2] tracking-[-1px] sm:text-[46px] sm:tracking-[-1.5px]">{state.draftIncognito ? 'Some thoughts are just for now.' : `${greeting}${state.settings.name.trim() ? `, ${state.settings.name.trim().split(' ')[0]}` : ''}.`}</h1><p className="mt-3 text-sm text-muted sm:text-[15px]">{state.draftIncognito ? 'No history. No memories. Just this conversation.' : 'What’s on your mind today?'}</p></>}
    </div>
    <Composer centered />
    <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">{starters.map(({ icon: Icon, title, description, prompt }) => <button key={title} onClick={() => state.setPrompt(prompt)} className="group rounded-xl border border-border/80 bg-panel/35 p-3.5 text-left transition-all hover:border-accent/40 hover:bg-panel/80"><div className="mb-3 flex items-center justify-between text-accent/85"><Icon size={17} strokeWidth={1.5} /><ArrowUpRight size={12} className="text-muted/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><span className="block text-xs font-medium">{title}</span><span className="mt-1 block text-[10px] leading-relaxed text-muted">{description}</span></button>)}</div>
    {!state.settings.baseUrl && <button onClick={() => useApp.setState({ settingsTab: 'connection' })} className="mx-auto mt-7 flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-2.5 text-[11px] text-muted transition-colors hover:bg-accent/10"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Make yourself at home. Connect OmniRoute to begin.<ArrowUpRight size={12} /></button>}
    <p className="mt-7 text-center text-[10px] tracking-wide text-muted/55">{state.draftIncognito ? 'Your gateway and enabled tools still receive requests.' : 'A little curiosity goes a long way.'}</p>
  </div></div>;
}
