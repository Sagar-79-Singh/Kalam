import { Keyboard } from 'lucide-react';
import { useApp } from '../store/app';
import { Modal } from './Modal';

const shortcuts = [
  ['⌘ / Ctrl + N', 'New conversation'],
  ['⌘ / Ctrl + Shift + N', 'New incognito conversation'],
  ['⌘ / Ctrl + K', 'Search your conversations'],
  ['⌘ / Ctrl + B', 'Toggle the sidebar'],
  ['⌘ / Ctrl + Shift + A', 'Toggle the artifact workspace'],
  ['⌘ / Ctrl + ,', 'Open settings'],
  ['Enter', 'Send a message'],
  ['Shift + Enter', 'Add a new line'],
  ['Esc', 'Close a dialog / stop generation'],
  ['?', 'Show this cheat sheet']
];
export function ShortcutsModal() {
  return <Modal title="A few handy shortcuts" onClose={() => useApp.setState({ shortcutsOpen: false })} className="max-w-lg"><div className="p-5"><p className="mb-5 flex items-center gap-2 text-xs text-muted"><Keyboard size={16} />Less clicking. More thinking.</p><div className="space-y-4">{shortcuts.map(([key, description]) => <div key={key} className="flex items-center justify-between gap-4"><span className="text-xs">{description}</span><kbd className="shrink-0 rounded-md border border-border bg-panel px-2 py-1 font-sans text-[10px] text-muted shadow-sm">{key}</kbd></div>)}</div></div></Modal>;
}
