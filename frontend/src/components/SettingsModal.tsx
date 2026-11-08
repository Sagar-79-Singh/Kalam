import { BookOpen, Brain, Database, Link2, Palette, Plug, UserRound, X } from 'lucide-react';
import { useApp, type SettingsTab } from '../store/app';
import { Modal } from './Modal';
import { IconButton } from './ui';
import { ConnectionSettings } from './settings/ConnectionSettings';
import { PersonalizationSettings } from './settings/PersonalizationSettings';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { SkillsSettings } from './settings/SkillsSettings';
import { ConnectorSettings } from './settings/ConnectorSettings';
import { MemorySettings } from './settings/MemorySettings';
import { DataSettings } from './settings/DataSettings';

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Link2 }> = [
  { id: 'connection', label: 'Connection', icon: Link2 },
  { id: 'personalization', label: 'Personalization', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'skills', label: 'Skills', icon: BookOpen },
  { id: 'connectors', label: 'Connectors', icon: Plug },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'data', label: 'Data & privacy', icon: Database }
];
export function SettingsModal() {
  const tab = useApp(s => s.settingsTab);
  if (!tab) return null;
  const close = () => useApp.setState({ settingsTab: null });
  const page = { connection: <ConnectionSettings />, personalization: <PersonalizationSettings />, appearance: <AppearanceSettings />, skills: <SkillsSettings />, connectors: <ConnectorSettings />, memory: <MemorySettings />, data: <DataSettings /> }[tab];
  return <Modal title="Settings" onClose={close} hideHeader className="h-[min(800px,90dvh)] max-w-[1020px]">
    <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4"><h2 className="font-display text-[24px] tracking-tight">Settings</h2><IconButton title="Close settings" onClick={close}><X size={18} /></IconButton></div>
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row"><nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-sidebar/40 p-2 sm:w-[195px] sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">{tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => useApp.setState({ settingsTab: id })} className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${tab === id ? 'bg-fg/[0.07] font-medium text-fg' : 'text-muted hover:bg-fg/5 hover:text-fg'}`}><Icon size={15} />{label}</button>)}<p className="mt-auto hidden px-3 pb-2 pt-6 text-[10px] leading-relaxed text-muted/70 sm:block">A space that feels like you.<br />Saved on this device.</p></nav><div key={tab} className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">{page}</div></div>
  </Modal>;
}
