import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Settings } from '../../types';
import { useApp } from '../../store/app';
import { fetchModels } from '../../lib/omniroute';
import { errorMessage } from '../../lib/utils';
import { Button, Field } from '../ui';

export function ConnectionSettings() {
  const settings = useApp(s => s.settings);
  const updateSettings = useApp(s => s.updateSettings);
  const [draft, setDraft] = useState(settings);
  const [models, setModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft(current => ({ ...current, [key]: value }));
  const patch = () => ({ baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim(), model: draft.model.trim(), apiFormat: draft.apiFormat, toolMode: draft.toolMode, maxTokens: draft.maxTokens, searchEndpoint: draft.searchEndpoint.trim(), searchApiKey: draft.searchApiKey.trim(), searchMethod: draft.searchMethod });
  const save = async () => {
    if (draft.baseUrl && !/^https?:\/\//i.test(draft.baseUrl)) { setError('The Base URL must start with http:// or https://.'); return; }
    setSaving(true); setError('');
    try { await updateSettings(patch()); toast.success('Connection settings saved'); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setSaving(false); }
  };
  const refresh = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try { await updateSettings(patch()); const list = await fetchModels({ ...settings, ...patch() }, request.signal); setModels(list); toast.success(`${list.length} model${list.length === 1 ? '' : 's'} discovered`); }
    catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  return <div className="space-y-6"><div><h3 className="section-title">Your intelligence, your way.</h3><p className="mt-2 text-sm leading-relaxed text-muted">OmniRoute is the only AI connection in this workspace. Point it at your own gateway.</p></div>
    <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-4"><Link2 size={18} className="mt-0.5 shrink-0 text-accent" /><p className="text-xs leading-[1.8] text-muted">The installed app connects from your computer, so a local gateway URL works here. Browser previews use a development bridge and cannot reach a gateway on your own computer.</p></div>
    <Field label="OmniRoute Base URL" hint="A root URL, /v1, /v1/messages, or /v1/chat/completions is accepted."><input data-autofocus className="input font-mono !text-xs" placeholder="http://localhost:20128/v1/messages" value={draft.baseUrl} onChange={event => change('baseUrl', event.target.value)} autoComplete="off" /></Field>
    <Field label="API key" hint="Stored on this device. Keys are included in full backups; keep those files private."><div className="relative"><input aria-label="OmniRoute API key" className="input pr-11 font-mono !text-xs" type={showKey ? 'text' : 'password'} placeholder="Your gateway API key" autoComplete="off" value={draft.apiKey} onChange={event => change('apiKey', event.target.value)} /><button type="button" title={showKey ? 'Hide API key' : 'Show API key'} aria-label={showKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3 text-muted">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="API format"><select className="input" value={draft.apiFormat} onChange={event => change('apiFormat', event.target.value as Settings['apiFormat'])}><option value="auto">Detect from URL</option><option value="messages">Messages API</option><option value="chat">Chat completions API</option></select></Field><Field label="Tool calling" hint="Tag mode works with most chat models."><select className="input" value={draft.toolMode} onChange={event => change('toolMode', event.target.value as Settings['toolMode'])}><option value="tags">Structured tags</option><option value="native">Native function tools</option></select></Field></div>
    <Field label="Model ID" hint="No model is preselected. Use the exact ID exposed by your gateway."><div className="flex gap-2"><input aria-label="Model ID" list="gateway-models" className="input font-mono !text-xs" placeholder="Enter your model ID" value={draft.model} onChange={event => change('model', event.target.value)} /><datalist id="gateway-models">{models.map(model => <option key={model} value={model} />)}</datalist><Button className="shrink-0" disabled={busy || !draft.baseUrl.trim()} busy={busy} onClick={() => void refresh()}>{!busy && <RefreshCw size={14} />}Refresh models</Button></div>{models.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-[#7b8d67]"><CheckCircle2 size={13} />{models.length} models available · choose or type above</p>}</Field>
    <Field label="Maximum response tokens"><input aria-label="Maximum response tokens" type="number" min={256} max={131072} step={256} className="input max-w-48" value={draft.maxTokens} onChange={event => change('maxTokens', Math.min(131072, Math.max(256, Number(event.target.value))))} /></Field>
    <div className="space-y-4 border-t border-border pt-6"><div><h4 className="font-medium">Web search</h4><p className="mt-1 text-xs leading-relaxed text-muted">Optional. Enable the globe in any chat to search before the model answers. Search is a context source, not a separate AI provider.</p></div><Field label="Search endpoint" hint="Example: http://localhost:8888/search?format=json&q={query}"><input className="input font-mono !text-xs" placeholder="https://your-search-server/search?q={query}" value={draft.searchEndpoint} onChange={event => change('searchEndpoint', event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-[120px_1fr]"><Field label="Method"><select className="input" value={draft.searchMethod} onChange={event => change('searchMethod', event.target.value as Settings['searchMethod'])}><option>GET</option><option>POST</option></select></Field><Field label="Search bearer token (optional)"><input type="password" autoComplete="off" className="input font-mono !text-xs" value={draft.searchApiKey} onChange={event => change('searchApiKey', event.target.value)} /></Field></div><p className="rounded-lg bg-surface/50 p-3 text-xs leading-[1.8] text-muted">Use a JSON endpoint such as a self-hosted SearXNG instance with JSON output enabled. GET substitutes <code className="font-mono">{'{query}'}</code> or adds <code>q</code>. POST sends <code className="font-mono">{'{"query":"…","q":"…"}'}</code>. Expected response: <code className="font-mono">{'{"results":[{"title":"…","url":"https://…","content":"…"}]}'}</code>.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs leading-relaxed text-red-500">{error}</p>}
    <div className="flex justify-end border-t border-border pt-4"><Button primary busy={saving} disabled={saving} onClick={() => void save()}>Save connection settings</Button></div>
  </div>;
}
