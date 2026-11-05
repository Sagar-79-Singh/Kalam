import { Children, isValidElement, memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ArrowUpRight, Brain, Copy, FileCode2, FileText, GitBranch, Pencil, RotateCcw, Volume2, VolumeX, CircleAlert } from 'lucide-react';
import type { ArtifactType, Message } from '../types';
import { newManualArtifact, useApp } from '../store/app';
import { copyText, humanSize, openExternal } from '../lib/utils';
import { parseModelOutput } from '../lib/artifacts';
import { regenerateMessage, sendUserMessage } from '../lib/conversation';
import { canSpeak, speak, stopSpeaking } from '../lib/voice';
import { BrandMark } from './Brand';
import { Button, IconButton } from './ui';
import { CodeBlock } from './CodeBlock';
import { SearchCard, ToolCard } from './ToolCard';

function plainText(node: ReactNode): string {
  return Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : '').join('');
}
const previewType = (language: string): ArtifactType | undefined => ({ html: 'html', jsx: 'react', tsx: 'react', svg: 'svg', mermaid: 'mermaid', markdown: 'markdown', md: 'markdown' })[language] as ArtifactType | undefined;
// Keep these component identities stable: scrolling, theme changes, and unrelated
// store updates must not remount a code block and terminate its running worker.
const markdownComponents: Components = {
  pre({ children }) {
    const child = Children.toArray(children)[0];
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return <pre>{children}</pre>;
    const code = plainText(child.props.children).replace(/\n$/, '');
    const language = /language-([\w+-]+)/.exec(child.props.className || '')?.[1] || '';
    const type = previewType(language);
    return <CodeBlock code={code} language={language} highlighted={child.props.children} onArtifact={type ? () => newManualArtifact(type, `${language.toUpperCase()} preview`, code) : undefined} />;
  },
  a({ href, children }) {
    return <a href={href} onClick={event => { event.preventDefault(); if (href) void openExternal(href); }}>{children}</a>;
  },
  table({ children }) { return <div className="overflow-x-auto"><table>{children}</table></div>; }
};

export const MessageBubble = memo(function MessageBubble({ message, chatId, streaming }: { message: Message; chatId: string; streaming: boolean }) {
  const busy = useApp(state => Boolean(state.streamingChatId));
  const memories = useApp(state => state.memories);
  const branchChat = useApp(state => state.branchChat);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [reading, setReading] = useState(false);
  if (message.role === 'tool') return null;
  const user = message.role === 'user';
  const parsed = user ? null : parseModelOutput(message.content, !streaming);
  const text = parsed?.text ?? message.content;
  const savedMemory = parsed?.memories.some(fact => memories.some(memory => memory.content.toLocaleLowerCase() === fact.toLocaleLowerCase()));
  const openArtifact = (id: string, index: number) => {
    const state = useApp.getState();
    const artifactId = id || `artifact-${message.id}-${index}`;
    const artifact = state.chats.find(chat => chat.id === chatId)?.artifacts.find(item => item.id === artifactId);
    const version = artifact?.versions.find(item => item.id === `${message.id}:${index}`);
    if (artifact && version) state.updateArtifact({ ...artifact, activeVersionId: version.id });
    useApp.setState({ artifactOpen: true, selectedArtifactId: artifactId });
  };
  return <div className={`print-message group/message relative animate-fade-up ${user ? 'mb-8 mt-2' : 'mb-9'}`}>
    {user ? <div className="ml-auto max-w-[92%] rounded-2xl bg-surface/65 px-5 py-3.5 sm:max-w-[88%]">
      {editing ? <div>
        <textarea aria-label="Edit your message" className="input min-h-28 resize-y bg-panel/70" value={draft} onChange={event => setDraft(event.target.value)} autoFocus />
        <div className="mt-2 flex justify-end gap-2"><Button onClick={() => setEditing(false)}>Cancel</Button><Button primary disabled={!draft.trim() || busy} onClick={() => { setEditing(false); void sendUserMessage(draft, message.attachments, message.id); }}>Save & send</Button></div>
        <p className="mt-2 text-[10px] text-muted">Sending an edit replaces the replies after this message. Branch first to keep them.</p>
      </div> : <div className="conversation-text whitespace-pre-wrap">{text}</div>}
      {message.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{message.attachments.map(file => file.dataUrl ? <img key={file.id} src={file.dataUrl} alt={file.name} className="max-h-48 max-w-full rounded-lg border border-border" /> : <div key={file.id} className="flex items-center gap-2 rounded-lg border border-border bg-panel/60 px-2.5 py-2 text-xs"><FileText size={16} className="text-accent" /><span><span className="block max-w-48 truncate">{file.name}</span><span className="text-[10px] text-muted">{humanSize(file.size)}</span></span></div>)}</div>}
    </div> : <div className="relative pl-0 sm:pl-9">
      <div className="absolute -left-0.5 top-1 hidden text-accent sm:block"><BrandMark className="h-6 w-6" /></div>
      {message.search && <SearchCard search={message.search} />}
      <div className="markdown conversation-text"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]} components={markdownComponents}>{text}</ReactMarkdown></div>
      {parsed?.artifacts.map(artifact => <button key={artifact.index} onClick={() => openArtifact(artifact.id, artifact.index)} className="my-4 flex w-full items-center gap-3.5 rounded-xl border border-border bg-panel px-4 py-4 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.025]">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface/50 text-accent"><FileCode2 size={20} strokeWidth={1.5} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{artifact.title}</span><span className="mt-0.5 block text-[11px] text-muted">{streaming && !artifact.complete ? 'Creating artifact…' : `Click to open · ${artifact.type.toUpperCase()}`}</span></span><ArrowUpRight size={16} className="text-muted" />
      </button>)}
      {savedMemory && <button onClick={() => useApp.setState({ settingsTab: 'memory' })} className="my-2 flex items-center gap-1.5 text-[11px] text-muted"><Brain size={12} />Memory updated</button>}
      {message.toolCalls?.map(tool => <ToolCard key={tool.id} tool={tool} />)}
      {streaming && !text && !parsed?.artifacts.length && !message.toolCalls?.length && <div className="flex h-9 items-center gap-1.5" aria-label="Thinking"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/70" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/50 [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/30 [animation-delay:300ms]" /></div>}
      {message.stopped && <p className="mt-3 text-xs text-muted">Response stopped.</p>}
      {message.error && <div role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 font-sans"><div className="flex items-start gap-2.5"><CircleAlert size={17} className="mt-0.5 shrink-0 text-red-500" /><div><p className="text-sm font-medium">Something interrupted the conversation</p><p className="mt-1 break-words text-xs leading-relaxed text-muted">{message.error}</p><Button className="mt-3 !py-1.5" disabled={busy} onClick={() => void regenerateMessage(message.id)}><RotateCcw size={12} />Retry</Button></div></div></div>}
    </div>}
    {!streaming && !editing && <div className={`no-print mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100 max-sm:opacity-100 ${user ? 'justify-end' : 'sm:pl-8'}`}>
      <IconButton title="Copy message" className="!h-7 !w-7" onClick={() => void copyText(text)}><Copy size={13} /></IconButton>
      {user ? <IconButton title="Edit message" disabled={busy} className="!h-7 !w-7" onClick={() => { setDraft(message.content); setEditing(true); }}><Pencil size={13} /></IconButton> : <>
        <IconButton title="Regenerate response" disabled={busy} className="!h-7 !w-7" onClick={() => void regenerateMessage(message.id)}><RotateCcw size={14} /></IconButton>
        <IconButton title={canSpeak() ? reading ? 'Stop reading aloud' : 'Read aloud' : 'Speech output is not supported by this webview'} disabled={!canSpeak() || !text} className="!h-7 !w-7" onClick={() => { if (reading) { stopSpeaking(); setReading(false); } else { speak(text, () => setReading(false)); setReading(true); } }}>{reading ? <VolumeX size={14} /> : <Volume2 size={14} />}</IconButton>
      </>}
      <IconButton title="Branch conversation from here" disabled={busy} className="!h-7 !w-7" onClick={() => branchChat(chatId, message.id)}><GitBranch size={13} /></IconButton>
      <span className="ml-2 text-[10px] text-muted/60">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>}
  </div>;
});
