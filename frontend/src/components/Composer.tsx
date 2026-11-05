import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Globe2, Loader2, Mic, Paperclip, Plug, Square, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import type { Attachment, ResponseStyle, SpeechRecognitionLike } from '../types';
import { useApp } from '../store/app';
import { readAttachment } from '../lib/files';
import { sendUserMessage } from '../lib/conversation';
import { errorMessage } from '../lib/utils';
import { ModelPicker } from './ModelPicker';
import { FileChips } from './FileChips';
import { IconButton, Toggle } from './ui';

export function Composer({ centered = false }: { centered?: boolean }) {
  const state = useApp();
  const chat = state.chats.find(c => c.id === state.activeChatId);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState<'connectors' | 'style' | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const fileGeneration = useRef(0);
  const busy = Boolean(state.streamingChatId);
  const search = chat?.webSearch ?? state.draftSearch;
  const ids = chat?.connectorIds ?? state.draftConnectorIds;
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  useEffect(() => {
    setFiles([]); fileGeneration.current++; setMenu(null);
    recognition.current?.abort();
  }, [state.activeChatId, state.activeProjectId, state.draftIncognito]);
  useEffect(() => {
    const element = input.current; if (!element) return;
    element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [state.promptDraft]);
  useEffect(() => () => recognition.current?.abort(), []);
  const addFiles = async (list: File[]) => {
    const generation = fileGeneration.current;
    if (files.length + list.length > 12) { toast.error('Keep each message to 12 files or fewer.'); return; }
    setReading(count => count + list.length);
    for (const file of list) {
      try { const attachment = await readAttachment(file); if (generation === fileGeneration.current) setFiles(old => [...old, attachment]); }
      catch (error) { toast.error('Could not attach file', { description: errorMessage(error) }); }
      finally { setReading(count => Math.max(0, count - 1)); }
    }
  };
  const send = () => {
    if (busy || reading || (!state.promptDraft.trim() && !files.length)) return;
    const content = state.promptDraft; const attachments = files; setFiles([]);
    recognition.current?.stop();
    void sendUserMessage(content, attachments);
    input.current?.focus();
  };
  const setSearch = () => chat ? state.updateChat({ ...chat, webSearch: !search }) : useApp.setState({ draftSearch: !search });
  const toggleConnector = (id: string) => {
    const next = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
    if (chat) state.updateChat({ ...chat, connectorIds: next }); else useApp.setState({ draftConnectorIds: next });
  };
  const mic = () => {
    if (listening) { recognition.current?.stop(); return; }
    if (!Recognition) return;
    const instance = new Recognition(); recognition.current = instance;
    instance.lang = navigator.language || 'en-IN'; instance.interimResults = false; instance.continuous = true;
    instance.onresult = event => {
      let transcript = '';
      for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) transcript += event.results[index][0].transcript + ' ';
      const current = useApp.getState().promptDraft;
      useApp.setState({ promptDraft: `${current}${current ? ' ' : ''}${transcript.trim()}` });
    };
    instance.onerror = event => { setListening(false); toast.error('Microphone unavailable', { description: event.error === 'not-allowed' ? 'Allow microphone access in your system privacy settings.' : event.error }); };
    instance.onend = () => setListening(false);
    try { instance.start(); setListening(true); } catch (error) { toast.error(errorMessage(error)); }
  };
  const chars = Array.from(state.promptDraft).length;
  const styles: ResponseStyle[] = ['normal', 'concise', 'explanatory', 'casual'];
  return <div className={`no-print relative w-full ${centered ? '' : 'mx-auto max-w-[800px]'}`}>
    {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
    <div onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)); }} className={`relative rounded-[20px] border bg-panel shadow-composer transition-colors focus-within:border-muted/50 ${dragging ? 'border-accent ring-4 ring-accent/10' : 'border-border'}`}>
      {dragging && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[20px] bg-panel/95 text-sm text-accent"><Paperclip size={18} className="mr-2" />Drop files into your conversation</div>}
      {files.length > 0 && <div className="px-4 pt-4"><FileChips files={files} onRemove={id => setFiles(old => old.filter(file => file.id !== id))} /></div>}
      <textarea ref={input} id="composer-input" aria-label="Message" rows={centered ? 3 : 2} value={state.promptDraft} placeholder={listening ? 'Listening… speak your mind' : chat?.incognito || state.draftIncognito ? 'An off-the-record thought…' : 'How can I help you today?'} onChange={event => useApp.setState({ promptDraft: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } if (event.key === 'Escape') recognition.current?.stop(); }} onPaste={event => { const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (images.length) { event.preventDefault(); void addFiles(images); } }} className={`conversation-text block max-h-[220px] min-h-[84px] w-full resize-none rounded-t-[20px] bg-transparent px-5 pb-3 pt-5 text-fg outline-none placeholder:text-muted/80 ${centered ? 'sm:min-h-[116px]' : ''}`} />
      <div className="flex flex-wrap items-center justify-between gap-1 px-3 pb-3">
        <div className="flex items-center gap-0.5">
          <input ref={fileInput} type="file" multiple className="hidden" aria-label="Upload files" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,text/*,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.go,.html,.css,.svg,.yaml,.yml,.xml,.sql,.sh,.rs,.java,.c,.cpp" onChange={event => { void addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
          <IconButton title="Attach files or images" disabled={reading > 0} onClick={() => fileInput.current?.click()}>{reading ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={18} />}</IconButton>
          <IconButton title={search ? 'Disable web search' : 'Enable web search'} aria-pressed={search} className={search ? '!bg-accent/10 !text-accent' : ''} onClick={setSearch}><Globe2 size={17} /></IconButton>
          <div className="relative"><IconButton title="Connectors for this chat" aria-pressed={menu === 'connectors'} className={ids.some(id => state.connectors.some(c => c.id === id && c.enabled)) ? '!text-accent' : ''} onClick={() => setMenu(menu === 'connectors' ? null : 'connectors')}><Plug size={17} /></IconButton>{menu === 'connectors' && <div className="absolute bottom-full left-0 z-20 mb-3 w-64 rounded-xl border border-border bg-panel p-3 shadow-xl"><p className="mb-3 text-xs font-semibold">Connectors for this chat</p>{state.connectors.filter(c => c.enabled).map(connector => <div key={connector.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="truncate">{connector.name}</span><Toggle value={ids.includes(connector.id)} onChange={() => toggleConnector(connector.id)} label={connector.name} /></div>)}{!state.connectors.some(c => c.enabled) && <p className="mb-3 text-xs leading-relaxed text-muted">Add a trusted MCP server to give your conversations useful tools.</p>}<button className="mt-2 text-xs text-accent hover:underline" onClick={() => { setMenu(null); useApp.setState({ settingsTab: 'connectors' }); }}>Manage connectors</button></div>}</div>
          <div className="relative"><button type="button" title="Response style" onClick={() => setMenu(menu === 'style' ? null : 'style')} className="ml-0.5 flex items-center gap-1 rounded-lg px-1.5 py-2 text-[11px] capitalize text-muted hover:bg-fg/5 max-[430px]:hidden">{state.settings.responseStyle}<ChevronDown size={10} /></button>{menu === 'style' && <div className="absolute bottom-full left-0 z-20 mb-3 w-40 rounded-xl border border-border bg-panel p-1.5 shadow-xl">{styles.map(style => <button key={style} onClick={() => { void state.updateSettings({ responseStyle: style }).catch(() => undefined); setMenu(null); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs capitalize hover:bg-surface">{style}{style === state.settings.responseStyle && <Check size={12} />}</button>)}</div>}</div>
        </div>
        <div className="flex min-w-0 items-center gap-1"><ModelPicker /><IconButton title={Recognition ? listening ? 'Stop listening' : 'Dictate a message' : 'Voice input is not supported in this webview'} disabled={!Recognition} onClick={mic} className={listening ? '!bg-accent/10 !text-accent' : ''}>{listening ? <VolumeX size={17} className="animate-pulse" /> : <Mic size={17} />}</IconButton><button type="button" aria-label={busy ? 'Stop generation' : 'Send message'} title={busy ? 'Stop generation' : 'Send message (Enter)'} disabled={!busy && ((!state.promptDraft.trim() && !files.length) || reading > 0 || !state.ready || Boolean(state.loadingError))} onClick={() => busy ? state.stop() : send()} className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-panel transition-colors hover:bg-accent/85 disabled:bg-surface disabled:text-muted/60">{busy ? <Square size={13} fill="currentColor" /> : <ArrowUp size={19} strokeWidth={2.1} />}</button></div>
      </div>
    </div>
    <div className="mt-2.5 flex items-center justify-between px-2 text-[10px] text-muted/80"><span>{reading ? `Reading ${reading} file${reading === 1 ? '' : 's'}…` : listening ? 'Microphone is on · tap to stop' : search ? 'Web search is on' : 'Enter to send · Shift Enter for a new line'}</span><span title="Tokens are an estimate, not model-specific tokenization">{chars.toLocaleString()} characters · ~{Math.ceil(state.promptDraft.length / 4).toLocaleString()} tokens</span></div>
  </div>;
}
