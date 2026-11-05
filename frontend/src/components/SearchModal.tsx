import { useMemo, useState } from 'react';
import { ArrowUpRight, MessageSquare, Search, X } from 'lucide-react';
import { useApp } from '../store/app';
import { parseModelOutput } from '../lib/artifacts';
import { Modal } from './Modal';
import { IconButton } from './ui';

export function SearchModal() {
  const state = useApp();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const results = useMemo(() => {
    const tokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return state.chats.filter(chat => !chat.incognito).sort((a, b) => b.updatedAt - a.updatedAt).flatMap(chat => {
      const messages = chat.messages.filter(message => message.role !== 'tool');
      const haystack = `${chat.title} ${messages.map(message => message.content).join(' ')}`.toLocaleLowerCase();
      if (!tokens.every(token => haystack.includes(token))) return [];
      const match = messages.find(message => tokens.some(token => message.content.toLocaleLowerCase().includes(token)));
      const text = match ? match.role === 'assistant' ? parseModelOutput(match.content, true).text : match.content : '';
      const position = tokens.length ? Math.max(0, text.toLocaleLowerCase().indexOf(tokens[0]) - 45) : 0;
      return [{ chat, snippet: text.slice(position, position + 160) || 'No messages yet' }];
    }).slice(0, 40);
  }, [state.chats, query]);
  const close = () => useApp.setState({ searchOpen: false });
  const select = (id: string) => { state.selectChat(id); close(); };
  return <Modal title="Search your conversations" onClose={close} className="max-w-2xl" hideHeader><div className="flex items-center gap-3 border-b border-border px-5 py-4"><Search size={19} className="shrink-0 text-muted" /><input data-autofocus aria-label="Search chats" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} placeholder="Find a thought, a phrase, a conversation…" onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(current => Math.min(results.length - 1, current + 1)); } if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(current => Math.max(0, current - 1)); } if (event.key === 'Enter' && results[index]) select(results[index].chat.id); }} /><IconButton title="Close search" onClick={close}><X size={17} /></IconButton></div><div className="max-h-[55dvh] min-h-48 overflow-y-auto p-2"><p className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted">{query.trim() ? `${results.length} results` : 'Recent conversations'}</p>{results.map(({ chat, snippet }, position) => <button key={chat.id} onMouseEnter={() => setIndex(position)} onClick={() => select(chat.id)} className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ${index === position ? 'bg-fg/5' : 'hover:bg-fg/5'}`}><MessageSquare size={16} className="mt-0.5 shrink-0 text-accent/70" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{chat.title}</span><span className="mt-1 block truncate text-xs text-muted">{snippet}</span><span className="mt-1.5 block text-[10px] text-muted/60">{new Date(chat.updatedAt).toLocaleDateString()}{chat.projectId ? ` · ${state.projects.find(project => project.id === chat.projectId)?.name || 'Project'}` : ''}</span></span><ArrowUpRight size={13} className="mt-1 text-muted" /></button>)}{!results.length && <div className="py-12 text-center"><p className="font-display text-xl">{query ? 'That thought is still out there.' : 'Nothing to search just yet.'}</p><p className="mt-2 text-xs text-muted">{query ? 'Try a different word or a shorter phrase.' : 'Your saved conversations will appear here.'}</p></div>}</div><div className="border-t border-border px-5 py-3 text-[10px] text-muted">↑ ↓ to navigate · Enter to open · Esc to close</div></Modal>;
}
