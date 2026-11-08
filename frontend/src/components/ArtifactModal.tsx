import { useState } from 'react';
import { FileCode2, Plus } from 'lucide-react';
import type { ArtifactType } from '../types';
import { newManualArtifact, useApp } from '../store/app';
import { Modal } from './Modal';
import { Button, EmptyState, Field } from './ui';

export function NewArtifactModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<ArtifactType>('html');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  return <Modal title="Bring an idea to life" onClose={onClose} className="max-w-2xl" top>
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); if (code.trim()) { newManualArtifact(type, title, code); onClose(); } }}>
      <div className="space-y-4 overflow-auto p-5"><p className="text-sm text-muted">Paste your code or document. Keep it self-contained; previews run in an isolated sandbox.</p><div className="grid grid-cols-[1fr_140px] gap-3"><Field label="Title"><input data-autofocus value={title} onChange={event => setTitle(event.target.value)} className="input" placeholder="A small, brilliant idea" /></Field><Field label="Type"><select className="input" value={type} onChange={event => setType(event.target.value as ArtifactType)}><option value="html">HTML</option><option value="react">React / JSX</option><option value="svg">SVG</option><option value="mermaid">Mermaid</option><option value="markdown">Markdown</option></select></Field></div><Field label="Source code"><textarea spellCheck={false} className="input min-h-[300px] resize-y font-mono !text-xs leading-relaxed" value={code} onChange={event => setCode(event.target.value)} placeholder={type === 'react' ? 'export default function App() {\n  return <h1>Hello, world.</h1>;\n}' : type === 'mermaid' ? 'graph LR\n  Idea --> SomethingWonderful' : type === 'markdown' ? '# A fresh perspective\n\nStart writing here…' : type === 'svg' ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">\n</svg>' : '<!doctype html>\n<html>\n  <body>Your idea goes here.</body>\n</html>'} /></Field></div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-4"><Button onClick={onClose}>Cancel</Button><button type="submit" disabled={!code.trim()} className="btn btn-primary"><Plus size={14} />Create artifact</button></div>
    </form>
  </Modal>;
}
export function ArtifactLibrary({ onClose, onNew }: { onClose: () => void; onNew: () => void }) {
  const state = useApp();
  const items = state.chats.filter(c => !c.incognito).flatMap(chat => chat.artifacts.map(artifact => ({ chat, artifact }))).reverse();
  return <Modal title="Your artifacts" onClose={onClose} className="max-w-3xl"><div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3"><p className="text-xs text-muted">Ideas you’ve turned into something tangible.</p><Button onClick={onNew}><Plus size={14} />New artifact</Button></div><div className="overflow-y-auto p-5">{items.length ? <div className="grid gap-3 sm:grid-cols-2">{items.map(({ chat, artifact }) => <button key={`${chat.id}:${artifact.id}`} onClick={() => { state.selectChat(chat.id); useApp.setState({ artifactOpen: true, selectedArtifactId: artifact.id }); onClose(); }} className="rounded-xl border border-border bg-panel p-4 text-left transition-colors hover:border-accent/50"><div className="mb-4 flex items-center justify-between"><span className="rounded-lg bg-accent/10 p-2.5 text-accent"><FileCode2 size={20} /></span><span className="text-[10px] uppercase tracking-wider text-muted">{artifact.type}</span></div><h3 className="truncate text-sm font-medium">{artifact.title}</h3><p className="mt-1 truncate text-xs text-muted">{chat.title}</p><p className="mt-3 text-[10px] text-muted">{artifact.versions.length} version{artifact.versions.length === 1 ? '' : 's'}</p></button>)}</div> : <EmptyState title="A shelf for your creations" icon={<FileCode2 size={32} strokeWidth={1.2} />}>Build something in chat, or paste your own code.<br />Your artifacts will be waiting right here.</EmptyState>}</div></Modal>;
}
