import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Pencil, Play, Plug, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Connector } from '../../types';
import { useApp } from '../../store/app';
import { testConnector } from '../../lib/connectors';
import { errorMessage, uid } from '../../lib/utils';
import { Button, EmptyState, Field, IconButton, Toggle } from '../ui';

export function ConnectorSettings() {
  const state = useApp();
  const [draft, setDraft] = useState<Connector | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const save = async () => {
    if (!draft) return;
    try {
      const url = new URL(draft.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) MCP URL without embedded credentials.');
      const previous = state.connectors.find(c => c.id === draft.id);
      const changed = !previous || previous.url !== draft.url || previous.authHeader !== draft.authHeader || previous.authValue !== draft.authValue;
      await state.saveConnector({ ...draft, name: draft.name.trim(), url: draft.url.trim(), ...(changed ? { tools: [], lastTested: undefined } : {}) });
      setDraft(null); toast.success('Connector saved. Test it to discover tools.');
    } catch (error) { toast.error('Could not save connector', { description: errorMessage(error) }); }
  };
  const test = async (connector: Connector) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setBusyId(connector.id); setErrors(old => ({ ...old, [connector.id]: '' }));
    try {
      const tools = await testConnector(connector, state.settings, controller.signal);
      await state.saveConnector({ ...connector, tools, lastTested: Date.now() });
      toast.success(`${connector.name} connected`, { description: `${tools.length} tools discovered` });
    } catch (error) { setErrors(old => ({ ...old, [connector.id]: controller.signal.aborted ? 'Connection test stopped or timed out after 30 seconds.' : errorMessage(error) })); }
    finally { clearTimeout(timeout); if (request.current === controller) setBusyId(null); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="section-title">Connect your world.</h3><p className="mt-2 text-sm text-muted">Bring trusted tools into your conversations with MCP.</p></div><Button onClick={() => setDraft({ id: uid(), name: '', url: '', authHeader: '', authValue: '', enabled: true, tools: [] })}><Plus size={14} />Add server</Button></div><p className="rounded-xl border border-border bg-panel p-4 text-xs leading-[1.8] text-muted">Use a <strong className="font-medium text-fg">Streamable HTTP</strong> MCP URL, not a local command or a legacy SSE-only endpoint. Enable trusted servers here, then choose them per chat with the plug button. Enabled tools may read or change data on their server; only connect servers you trust.</p>
    {draft && <div className="space-y-4 rounded-xl border border-accent/30 bg-panel p-4"><h4 className="text-sm font-medium">{state.connectors.some(c => c.id === draft.id) ? 'Edit MCP server' : 'New MCP server'}</h4><Field label="Server name"><input autoFocus className="input" placeholder="My workspace" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="MCP server URL"><input className="input font-mono !text-xs" placeholder="https://your-server.example/mcp" value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Auth header (optional)"><input className="input font-mono !text-xs" placeholder="Authorization" value={draft.authHeader} onChange={event => setDraft({ ...draft, authHeader: event.target.value })} /></Field><Field label="Header value"><input type="password" autoComplete="off" className="input font-mono !text-xs" placeholder="Bearer your-token" value={draft.authValue} onChange={event => setDraft({ ...draft, authValue: event.target.value })} /></Field></div><div className="flex justify-end gap-2"><Button onClick={() => setDraft(null)}>Cancel</Button><Button primary disabled={!draft.name.trim() || !draft.url.trim()} onClick={() => void save()}>Save server</Button></div></div>}
    {!state.connectors.length ? <EmptyState title="A little more connected" icon={<Plug size={32} strokeWidth={1.2} />}>Your files, your services, your tools.<br />Add an MCP server to bring them closer.</EmptyState> : state.connectors.map(connector => <div key={connector.id} className="rounded-xl border border-border bg-panel p-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-accent/10 p-2 text-accent"><Plug size={17} /></span><div className="min-w-0 flex-1"><h4 className="text-sm font-medium">{connector.name}</h4><p className="mt-1 truncate font-mono text-[10px] text-muted" title={connector.url}>{connector.url}</p></div><Toggle label={`Enable ${connector.name}`} value={connector.enabled} onChange={enabled => void state.saveConnector({ ...connector, enabled }).catch(error => toast.error(errorMessage(error)))} /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button disabled={Boolean(busyId) && busyId !== connector.id} busy={busyId === connector.id} className="!py-1.5 !text-xs" onClick={() => busyId === connector.id ? request.current?.abort() : void test(connector)}>{busyId === connector.id ? 'Stop test' : <><Play size={12} />Test connection</>}</Button><div className="flex"><IconButton title={`Edit ${connector.name}`} onClick={() => setDraft(connector)}><Pencil size={14} /></IconButton><IconButton title={`Delete ${connector.name}`} onClick={() => useApp.setState({ confirm: { title: 'Remove this connector?', description: 'This removes the server and its saved credentials from this device. Existing tool cards will remain in your chats.', destructive: true, action: () => state.removeConnector(connector.id) } })}><Trash2 size={14} /></IconButton></div></div>
      {errors[connector.id] && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/5 p-3 text-xs leading-relaxed text-red-500"><CircleAlert size={14} className="mt-0.5 shrink-0" />{errors[connector.id]}</p>}
      {connector.lastTested && <details className="mt-3 border-t border-border pt-3"><summary className="cursor-pointer text-xs text-muted"><CheckCircle2 size={12} className="mr-1.5 inline text-[#81926c]" />{connector.tools.length} tools discovered · {new Date(connector.lastTested).toLocaleDateString()}</summary><div className="mt-3 space-y-3">{connector.tools.map(tool => <div key={tool.name}><p className="font-mono text-xs">{tool.name}</p><p className="mt-1 text-[11px] leading-relaxed text-muted">{tool.description || 'No description supplied by the server.'}</p></div>)}</div></details>}
    </div>)}
  </div>;
}
