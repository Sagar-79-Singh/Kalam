import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Loader2, Play, Square, Terminal, FileCode2 } from 'lucide-react';
import { copyText } from '../lib/utils';
import { executeCode, type ExecutionState } from '../lib/execution';
interface Props { code: string; language: string; highlighted?: ReactNode; onArtifact?: () => void }
export function CodeBlock({ code, language, highlighted, onArtifact }: Props) {
  const [copied, setCopied] = useState(false); const [state, setState] = useState<ExecutionState>(); const [stdout, setStdout] = useState(''); const [stderr, setStderr] = useState('');
  const stop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stop.current?.(), []);
  const busy = state === 'running' || state === 'loading';
  const run = () => { setStdout(''); setStderr(''); stop.current = executeCode(language, code, { onState: setState, onOutput: (stream, text) => stream === 'stdout' ? setStdout(old => old + text) : setStderr(old => old + text) }); };
  const copy = () => { void copyText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return <div className="my-4 overflow-hidden rounded-xl border border-border bg-panel font-sans text-[13px] leading-relaxed"><div className="flex items-center justify-between border-b border-border bg-surface/35 px-3.5 py-2"><span className="font-mono text-[11px] text-muted">{language || 'code'}</span><div className="no-print flex items-center gap-3">{onArtifact && <button title="Open as an artifact" onClick={onArtifact} className="flex items-center gap-1.5 text-[11px] text-muted hover:text-fg"><FileCode2 size={12} />Preview</button>}{/^(js|javascript|py|python)$/.test(language) && <button onClick={() => busy ? stop.current?.() : run()} className="flex items-center gap-1.5 text-[11px] text-muted hover:text-fg">{busy ? state === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Square size={11} /> : <Play size={12} />}{busy ? 'Stop' : 'Run'}</button>}<button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-muted hover:text-fg">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button></div></div>
    <pre className="code-content m-0 overflow-x-auto p-4 font-mono text-[12px] leading-[1.75]"><code>{highlighted ?? code}</code></pre>
    {state && <div className="border-t border-border bg-fg/[0.025] px-4 py-3"><div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted"><Terminal size={12} />{state === 'loading' ? 'Loading runtime… first Python run needs internet' : state === 'running' ? 'Running · 10s limit' : state === 'done' ? 'Output' : state === 'stopped' ? 'Stopped' : 'Execution error'}</div>{stdout && <div><span className="text-[10px] text-muted">stdout</span><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{stdout}</pre></div>}{stderr && <div className={stdout ? 'mt-3' : ''}><span className="text-[10px] text-red-500">stderr</span><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-red-500 dark:text-red-300">{stderr}</pre></div>}{!stdout && !stderr && state === 'done' && <span className="text-xs text-muted">Finished with no output.</span>}</div>}
  </div>;
}
