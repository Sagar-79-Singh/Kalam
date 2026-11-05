import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeStream } from '../src/lib/native-stream.ts';
import type { NativeBridge } from '../src/types.ts';

function fixture() {
  const listeners = new Map<string, (...data: unknown[]) => void>();
  let requestId = '';
  let cancelled = 0;
  const mcpArgs: string[][] = [];
  const bridge: Pick<NativeBridge, 'StartOmniRouteStream' | 'StartMCPRequest' | 'CancelRequest'> = {
    async StartOmniRouteStream(id) { requestId = id; },
    async StartMCPRequest(...args) { requestId = args[0]; mcpArgs.push(args); },
    async CancelRequest() { cancelled++; }
  };
  Object.assign(globalThis, { window: { runtime: {
    EventsOnMultiple(name: string, callback: (...data: unknown[]) => void) { listeners.set(name, callback); return () => { listeners.delete(name); }; },
    EventsOff(name: string) { listeners.delete(name); }
  } } });
  return { bridge, listeners, mcpArgs, get cancelled() { return cancelled; }, emit(value: unknown) { listeners.get(`gateway:${requestId}`)?.(value); } };
}
test('native bytes arrive before EOF, preserving fragmented Unicode and response headers', async () => {
  const state = fixture();
  const pending = nativeStream(state.bridge, 'omniroute', { body: '{}', headers: { 'X-Kalam-Format': 'messages' } });
  state.emit({ kind: 'headers', status: 200, headers: { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'session' } });
  const response = await pending;
  assert.equal(response.headers.get('Mcp-Session-Id'), 'session');
  const reader = response.body!.getReader();
  const bytes = new TextEncoder().encode('नमस्ते 🌱');
  const firstRead = reader.read();
  state.emit({ kind: 'chunk', data: Buffer.from(bytes.slice(0, 2)).toString('base64') });
  const first = await firstRead;
  assert.equal(first.done, false, 'bytes must arrive before the native request ends');
  state.emit({ kind: 'chunk', data: Buffer.from(bytes.slice(2)).toString('base64') });
  state.emit({ kind: 'end' });
  const second = await reader.read();
  const decoder = new TextDecoder();
  assert.equal(decoder.decode(first.value, { stream: true }) + decoder.decode(second.value), 'नमस्ते 🌱');
  assert.equal((await reader.read()).done, true);
  assert.equal(state.listeners.size, 0);
});
test('abort cancels native requests even before metadata and removes the listener', async () => {
  const state = fixture(); const abort = new AbortController();
  const pending = nativeStream(state.bridge, 'omniroute', { signal: abort.signal, body: '{}' });
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(state.cancelled > 0); assert.equal(state.listeners.size, 0);
});
test('MCP transport forwards only connector ID, session, and protocol, and accepts no-content notifications', async () => {
  const state = fixture();
  const pending = nativeStream(state.bridge, 'mcp/connector-id', { body: '{}', headers: { 'Mcp-Session-Id': 's1', 'Mcp-Protocol-Version': '2025-03-26' } });
  assert.deepEqual(state.mcpArgs[0].slice(1), ['connector-id', '{}', 's1', '2025-03-26']);
  state.emit({ kind: 'headers', status: 204, headers: {} }); state.emit({ kind: 'end' });
  assert.equal((await pending).status, 204);
  assert.equal(state.listeners.size, 0);
});
