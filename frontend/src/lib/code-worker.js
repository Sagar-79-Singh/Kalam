let python;
const send = (stream, values) => self.postMessage({ type: 'output', stream, text: values.map(value => {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2) ?? String(value); } catch { return String(value); }
}).join(' ') + '\n' });
for (const key of ['indexedDB', 'caches', 'WebSocket', 'EventSource', 'BroadcastChannel', 'SharedWorker', 'Worker']) {
  try { Object.defineProperty(self, key, { value: undefined, writable: false, configurable: false }); } catch { /* Not every worker has these APIs. */ }
}
console.log = (...values) => send('stdout', values);
console.info = (...values) => send('stdout', values);
console.warn = (...values) => send('stderr', values);
console.error = (...values) => send('stderr', values);
self.onmessage = async event => {
  const { type, language, source } = event.data;
  try {
    if (type === 'init') {
      if (language === 'python') {
        const base = 'https://cdn.jsdelivr.net/pyodide/v__PYODIDE_VERSION__/full/';
        const originalFetch = self.fetch.bind(self);
        self.fetch = (resource, init) => {
          const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url;
          if (!url.startsWith(base)) return Promise.reject(new Error('Network access is disabled in code execution.'));
          return originalFetch(resource, { ...init, credentials: 'omit' });
        };
        importScripts(base + 'pyodide.js');
        python = await self.loadPyodide({ indexURL: base, stdout: text => send('stdout', [text]), stderr: text => send('stderr', [text]) });
      } else {
        for (const key of ['fetch', 'XMLHttpRequest', 'importScripts']) Object.defineProperty(self, key, { value: undefined, writable: false, configurable: false });
      }
      self.postMessage({ type: 'ready' });
    } else if (type === 'run') {
      if (language === 'python') {
        const value = await python.runPythonAsync(source);
        if (value !== undefined && value !== null) { send('stdout', [String(value)]); value.destroy?.(); }
      } else {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const result = await new AsyncFunction('"use strict";\n' + source)();
        if (result !== undefined) send('stdout', [result]);
      }
      self.postMessage({ type: 'done' });
    }
  } catch (error) { send('stderr', [error instanceof Error ? error.stack || error.message : String(error)]); self.postMessage({ type: 'failed' }); }
};
