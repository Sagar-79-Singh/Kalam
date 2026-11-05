import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../store/app';
import { fetchModels } from '../lib/omniroute';
import { errorMessage } from '../lib/utils';
import { IconButton } from './ui';

export function ModelPicker() {
  const settings = useApp(s => s.settings);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [manual, setManual] = useState(settings.model);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { setManual(settings.model); }, [settings.model]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const refresh = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try { setModels(await fetchModels(settings, request.signal)); }
    catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)); }
    finally { if (!request.signal.aborted) setLoading(false); }
  };
  const choose = async (model: string) => {
    if (!model.trim()) return;
    const state = useApp.getState();
    await state.updateSettings({ model: model.trim() }).catch(() => undefined);
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat) state.updateChat({ ...chat, model: model.trim() });
    setOpen(false);
  };
  return <div ref={root} className="relative min-w-0">
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && !models.length && settings.baseUrl) void refresh(); }} className="flex max-w-[230px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-fg/5 hover:text-fg">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${settings.model && settings.baseUrl ? 'bg-[#879574]' : 'bg-muted/45'}`} /><span className="truncate">{settings.model || 'Choose a model'}</span><ChevronDown size={12} className="shrink-0" />
    </button>
    {open && <div role="dialog" aria-label="Choose an OmniRoute model" className="absolute bottom-full right-0 z-30 mb-3 w-[min(320px,85vw)] rounded-xl border border-border bg-panel p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between"><span className="px-1 text-xs font-semibold">OmniRoute models</span><IconButton title="Refresh models" disabled={loading} onClick={() => void refresh()}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</IconButton></div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-500/5 p-2.5 text-xs leading-relaxed text-red-500">{error}</p>}
      <div className="mb-2 max-h-52 overflow-auto">{models.map(model => <button key={model} onClick={() => void choose(model)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-surface"><span className="truncate">{model}</span>{settings.model === model && <Check size={13} className="shrink-0 text-accent" />}</button>)}{!models.length && !loading && !error && <p className="px-1 pb-3 text-xs leading-relaxed text-muted">Connect your gateway in Settings, or enter the model ID below.</p>}</div>
      <form onSubmit={event => { event.preventDefault(); void choose(manual); }} className="flex gap-2 border-t border-border pt-3"><input aria-label="Manual model ID" placeholder="Enter a model ID" className="input !py-2 !text-xs" value={manual} onChange={event => setManual(event.target.value)} /><button disabled={!manual.trim()} className="btn !px-3 !py-2 !text-xs">Use</button></form>
      <button onClick={() => { setOpen(false); useApp.setState({ settingsTab: 'connection' }); }} className="mt-3 flex items-center gap-1.5 px-1 text-[11px] text-muted hover:text-fg"><SlidersHorizontal size={12} />Connection settings</button>
    </div>}
  </div>;
}
