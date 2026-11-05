import assert from 'node:assert/strict';
import test from 'node:test';
import { readSSE } from '../src/lib/sse.ts';

function stream(bytes: Uint8Array, width: number): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += width) controller.enqueue(bytes.slice(index, index + width)); controller.close(); } });
}
test('SSE accepts split UTF-8, CRLF, comments, multiline data, and an unterminated final frame', async () => {
  const bytes = new TextEncoder().encode(': ping\r\nevent: delta\r\ndata: {"text":"नमस्ते 🌱"}\r\n\r\ndata: first\ndata: second\n\ndata: [DONE]');
  for (let width = 1; width <= 14; width++) {
    const events = [];
    for await (const event of readSSE(stream(bytes, width))) events.push(event);
    assert.deepEqual(events, [{ event: 'delta', data: '{"text":"नमस्ते 🌱"}' }, { event: 'message', data: 'first\nsecond' }, { event: 'message', data: '[DONE]' }]);
  }
});
test('aborted streams reject with AbortError', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(async () => { for await (const _event of readSSE(stream(new Uint8Array(), 1), controller.signal)) { /* Consume the stream. */ } }, { name: 'AbortError' });
});
