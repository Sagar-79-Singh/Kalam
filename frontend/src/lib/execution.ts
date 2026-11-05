import { PYODIDE_VERSION } from '../constants';
import workerSource from './code-worker.js?raw';
export type ExecutionState = 'loading' | 'running' | 'done' | 'error' | 'stopped';
export interface ExecutionCallbacks { onOutput: (stream: 'stdout' | 'stderr', text: string) => void; onState: (state: ExecutionState) => void }
let pythonWorker: Worker | undefined; let pythonReady = false; let pythonBusy = false;
function makeWorker(): Worker {
  const url = URL.createObjectURL(new Blob([workerSource.replaceAll('__PYODIDE_VERSION__', PYODIDE_VERSION)], { type: 'text/javascript' }));
  const worker = new Worker(url); URL.revokeObjectURL(url); return worker;
}
export function executeCode(language: string, source: string, callbacks: ExecutionCallbacks): () => void {
  const python = /^(py|python)$/.test(language);
  if (python && pythonBusy) { callbacks.onOutput('stderr', 'Another Python snippet is running. Stop it or wait for it to finish.'); callbacks.onState('error'); return () => undefined; }
  const worker = python ? pythonWorker ??= makeWorker() : makeWorker(); if (python) pythonBusy = true;
  let finished = false; let outputBytes = 0; let timer: ReturnType<typeof setTimeout>;
  const end = (state: ExecutionState, terminate: boolean) => {
    if (finished) return; finished = true; clearTimeout(timer); worker.removeEventListener('message', message); worker.removeEventListener('error', error);
    if (python) { pythonBusy = false; if (terminate) { worker.terminate(); pythonWorker = undefined; pythonReady = false; } }
    else worker.terminate(); callbacks.onState(state);
  };
  const run = () => { callbacks.onState('running'); timer = setTimeout(() => { callbacks.onOutput('stderr', 'Execution stopped: 10-second time limit reached.\n'); end('error', true); }, 10_000); worker.postMessage({ type: 'run', language: python ? 'python' : 'javascript', source }); };
  const message = (event: MessageEvent<{ type: string; stream?: 'stdout' | 'stderr'; text?: string }>) => {
    if (event.data.type === 'ready') { clearTimeout(timer); if (python) pythonReady = true; run(); }
    if (event.data.type === 'output' && event.data.text && outputBytes < 100_000) { const text = event.data.text.slice(0, 100_000 - outputBytes); outputBytes += text.length; callbacks.onOutput(event.data.stream || 'stdout', text); }
    if (event.data.type === 'done') end('done', false);
    if (event.data.type === 'failed') end('error', !pythonReady);
  };
  const error = (event: ErrorEvent) => { callbacks.onOutput('stderr', `${event.message || 'Runtime could not load. Check internet access for the first Python run.'}\n`); end('error', true); };
  worker.addEventListener('message', message); worker.addEventListener('error', error);
  if (python && pythonReady) run();
  else { callbacks.onState('loading'); timer = setTimeout(() => { callbacks.onOutput('stderr', 'Runtime download timed out. Check your connection and try again.\n'); end('error', true); }, 90_000); worker.postMessage({ type: 'init', language: python ? 'python' : 'javascript' }); }
  return () => end('stopped', true);
}
