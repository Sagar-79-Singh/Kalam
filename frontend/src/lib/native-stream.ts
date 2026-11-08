import type { NativeBridge } from '../types.ts';

function packet(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
/** Wails' Windows HTTP asset handler buffers responses until EOF. Native events
 * preserve incremental byte delivery; all platforms use the same SSE parser. */
export function nativeStream(bridge: Pick<NativeBridge, 'CancelRequest' | 'StartOmniRouteStream' | 'StartMCPRequest'>, path: string, init: RequestInit): Promise<Response> {
  const runtime = window.runtime;
  if (!runtime) return Promise.reject(new Error('The desktop event bridge is not ready. Please reopen the app.'));
  const id = crypto.randomUUID();
  const channel = `gateway:${id}`;
  const signal = init.signal;
  if (signal?.aborted) return Promise.reject(new DOMException('Request stopped', 'AbortError'));
  const headers = new Headers(init.headers);
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let ended = false;
  let receivedHeaders = false;
  let unsubscribe: (() => void) | undefined;
  let resolveResponse: (response: Response) => void;
  let rejectResponse: (error: Error) => void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const response = new Promise<Response>((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  const cancelNative = () => { void bridge.CancelRequest(id).catch(() => undefined); };
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (unsubscribe) unsubscribe(); else runtime.EventsOff(channel); };
  const fail = (error: Error) => {
    if (ended) return;
    ended = true; controller.error(error); rejectResponse(error); cleanup(); cancelNative();
  };
  const abort = () => fail(new DOMException('Request stopped', 'AbortError'));
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { if (!ended) { ended = true; cleanup(); cancelNative(); } }
  });
  unsubscribe = runtime.EventsOnMultiple(channel, (value: unknown) => {
    if (ended || !packet(value)) return;
    try {
      if (value.kind === 'headers') {
        const status = typeof value.status === 'number' ? value.status : 200;
        const responseHeaders = new Headers();
        if (packet(value.headers)) for (const [key, content] of Object.entries(value.headers)) if (typeof content === 'string') responseHeaders.set(key, content);
        receivedHeaders = true; clearTimeout(timer);
        resolveResponse(new Response([204, 205, 304].includes(status) ? null : stream, { status, headers: responseHeaders }));
      } else if (value.kind === 'chunk' && typeof value.data === 'string') {
        controller.enqueue(Uint8Array.from(atob(value.data), char => char.charCodeAt(0)));
      } else if (value.kind === 'end') {
        if (!receivedHeaders) resolveResponse(new Response(stream));
        ended = true; controller.close(); cleanup();
      } else if (value.kind === 'error') fail(new Error(typeof value.error === 'string' ? value.error : 'The gateway stream was interrupted.'));
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  }, -1);
  signal?.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => fail(new Error('The desktop gateway did not respond within 60 seconds.')), 60_000);
  const body = typeof init.body === 'string' ? init.body : '{}';
  const start = path === 'omniroute'
    ? bridge.StartOmniRouteStream(id, body, headers.get('X-Kalam-Format') || 'chat')
    : bridge.StartMCPRequest(id, decodeURIComponent(path.slice(4)), body, headers.get('Mcp-Session-Id') || '', headers.get('Mcp-Protocol-Version') || '');
  void start.then(() => { if (signal?.aborted || ended) cancelNative(); }).catch(error => fail(error instanceof Error ? error : new Error(String(error))));
  return response;
}
