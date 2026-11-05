import { useEffect, useRef, useState } from 'react';
import { Check, Code2, Copy, Download, Eye, FileCode2, Loader2, Maximize2, Minimize2, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Artifact, ArtifactType } from '../types';
import { useApp } from '../store/app';
import { makePreview } from '../lib/preview';
import { copyText, downloadFile, errorMessage, safeFilename, uid } from '../lib/utils';
import { Button, IconButton } from './ui';

const extensions: Record<ArtifactType, string> = { html: 'html', react: 'tsx', svg: 'svg', mermaid: 'mmd', markdown: 'md' };
export function ArtifactPanel({ onNew }: { onNew: () => void }) {
  const state = useApp();
  const chat = state.chats.find(c => c.id === state.activeChatId);
  const artifact = chat?.artifacts.find(a => a.id === state.selectedArtifactId) ?? chat?.artifacts.at(-1);
  if (!state.artifactOpen) return null;
  return <ArtifactWorkspace key={artifact?.id ?? 'empty'} artifact={artifact} onNew={onNew} />;
}
function ArtifactWorkspace({ artifact, onNew }: { artifact?: Artifact; onNew: () => void }) {
  const updateArtifact = useApp(s => s.updateArtifact);
  const streaming = useApp(s => s.streamingChatId === artifact?.chatId && Boolean(s.streamingMessageId));
  const version = artifact?.versions.find(v => v.id === artifact.activeVersionId) ?? artifact?.versions.at(-1);
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const previewCode = editing ? draft : version?.code ?? '';
  useEffect(() => {
    if (!artifact || tab !== 'preview') return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void makePreview(artifact.type, previewCode).then(html => { if (!cancelled) { setPreview(html); setError(''); setLoading(false); } }).catch(failure => { if (!cancelled) { if (!streaming) setError(errorMessage(failure)); setLoading(false); } });
    }, streaming ? 600 : 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [artifact?.type, previewCode, refresh, tab, streaming]);
  const close = () => {
    if (editing && draft !== version?.code) {
      useApp.setState({ confirm: { title: 'Discard your code edits?', description: 'Your saved artifact versions will stay unchanged.', action: async () => { setEditing(false); useApp.setState({ artifactOpen: false }); } } });
    } else useApp.setState({ artifactOpen: false });
  };
  const save = () => {
    if (!artifact || !draft.trim()) return;
    const id = uid();
    updateArtifact({ ...artifact, activeVersionId: id, versions: [...artifact.versions, { id, number: artifact.versions.length + 1, code: draft, createdAt: Date.now() }] });
    setEditing(false); toast.success('New artifact version saved');
  };
  const download = () => { if (artifact) void downloadFile(`${safeFilename(artifact.title)}-v${version?.number ?? 1}.${extensions[artifact.type]}`, previewCode, artifact.type === 'svg' ? 'image/svg+xml' : 'text/plain').catch(failure => toast.error('Could not export artifact', { description: errorMessage(failure) })); };
  const chat = useApp.getState().chats.find(c => c.id === artifact?.chatId);
  return <aside aria-label="Artifact workspace" className={`no-print absolute z-40 flex animate-slide-in flex-col overflow-hidden border border-border bg-panel shadow-panel ${fullscreen ? 'inset-3 rounded-2xl' : 'bottom-3 right-3 top-3 w-[min(54vw,850px)] min-w-[460px] rounded-2xl'} max-[1100px]:inset-0 max-[1100px]:w-full max-[1100px]:min-w-0 max-[1100px]:rounded-none`}>
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3.5"><span className="rounded-lg bg-accent/10 p-2 text-accent"><FileCode2 size={17} /></span><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{artifact?.title ?? 'Your artifact workspace'}</h2><p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{artifact?.type ?? 'A space for ideas to take shape'}</p></div><IconButton title="New artifact" onClick={onNew}><Plus size={16} /></IconButton><IconButton title={fullscreen ? 'Exit fullscreen' : 'Fullscreen artifact'} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</IconButton><IconButton title="Close artifact panel" onClick={close}><X size={18} /></IconButton></div>
    {!artifact ? <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center"><FileCode2 size={40} strokeWidth={1} className="text-accent/70" /><h3 className="font-display text-2xl">Something worth making.</h3><p className="max-w-xs text-sm leading-relaxed text-muted">Ask for a website, diagram, or document, or bring your own code.</p><Button primary onClick={onNew}><Plus size={14} />New artifact</Button></div> : <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-bg/40 px-4 py-2.5"><div role="tablist" aria-label="Artifact view" className="flex rounded-lg bg-surface/50 p-0.5">{(['preview', 'code'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setTab(item === 'preview' ? 'code' : 'preview'); } }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${tab === item ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg'}`}>{item === 'preview' ? <Eye size={13} /> : <Code2 size={13} />}{item === 'preview' ? 'Preview' : 'Code'}</button>)}</div>
        <div className="flex items-center gap-1"><select aria-label="Artifact version" disabled={editing} value={version?.id} onChange={event => updateArtifact({ ...artifact, activeVersionId: event.target.value })} className="max-w-40 rounded-lg border border-border bg-panel px-2 py-1.5 text-xs outline-none">{artifact.versions.map(v => <option key={v.id} value={v.id}>v{v.number}{v.messageId ? '' : ' · edited'}{v.id === artifact.versions.at(-1)?.id ? ' · latest' : ''}</option>)}</select><IconButton title="Refresh preview" onClick={() => setRefresh(count => count + 1)}><RefreshCw size={13} /></IconButton></div>
      </div>
      {chat && chat.artifacts.length > 1 && <div className="shrink-0 border-b border-border px-4 py-2"><select aria-label="Select artifact" disabled={editing} value={artifact.id} onChange={event => useApp.setState({ selectedArtifactId: event.target.value })} className="w-full bg-transparent text-xs text-muted outline-none">{chat.artifacts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        {tab === 'code' ? <textarea aria-label={editing ? 'Edit artifact source' : 'Artifact source code'} spellCheck={false} readOnly={!editing} value={previewCode} onChange={event => setDraft(event.target.value)} className="h-full w-full resize-none bg-panel p-5 font-mono text-[12px] leading-[1.8] text-fg outline-none" /> : <>
          {preview && !error && <iframe ref={iframe} key={refresh} title={`${artifact.title} preview`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview} className="h-full w-full border-0" />}
          {loading && !preview && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel text-xs text-muted"><Loader2 size={22} className="animate-spin text-accent" />{streaming ? 'Creating your artifact…' : 'Preparing preview…'}</div>}
          {error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-panel p-8"><p className="text-sm font-medium">The preview needs a little attention</p><pre className="max-h-60 w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-red-500/5 p-4 font-mono text-xs text-red-500">{error}</pre><Button onClick={() => setTab('code')}><Code2 size={14} />View the source</Button></div>}
          {loading && preview && <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-border bg-panel/95 px-2.5 py-1.5 text-[10px] text-muted"><Loader2 size={10} className="animate-spin" />Updating</span>}
        </>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-panel px-4 py-3"><span className="text-[10px] text-muted">{streaming ? 'Live · source is streaming' : editing ? 'Edits are saved as a new version' : 'Sandboxed preview · no network access'}</span><div className="flex items-center gap-1">{editing ? <><Button className="!py-1.5 !text-xs" onClick={() => setEditing(false)}>Cancel</Button><Button primary className="!py-1.5 !text-xs" disabled={!draft.trim() || draft === version?.code} onClick={save}><Check size={12} />Save version</Button></> : <><IconButton title="Edit source code" disabled={streaming} onClick={() => { setDraft(version?.code ?? ''); setEditing(true); setTab('code'); }}><Pencil size={14} /></IconButton><IconButton title="Copy artifact code" onClick={() => void copyText(previewCode)}><Copy size={14} /></IconButton><IconButton title="Download artifact" onClick={download}><Download size={14} /></IconButton></>}</div></div>
    </>}
  </aside>;
}
