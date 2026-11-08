import assert from 'node:assert/strict';
import test from 'node:test';
import type { Message, Settings } from '../src/types.ts';
import { sendMessage, apiFormat, fetchModels } from '../src/lib/omniroute.ts';
import { defaultSettings } from '../src/lib/defaults.ts';

Object.assign(globalThis, { window: {} });
const settings: Settings = { ...defaultSettings, baseUrl: 'http://example.test/v1/messages', model: 'selected-model' };
const user: Message = { id: 'u', role: 'user', content: 'Hello', createdAt: 1, attachments: [] };
function sse(frames: unknown[]): Response {
  const bytes = new TextEncoder().encode(frames.map(frame => `data: ${JSON.stringify(frame)}\r\n\r\n`).join('') + 'data: [DONE]\n\n');
  return new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
test('messages-protocol text and partial tool JSON stream incrementally', async () => {
  const original = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sse([{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello 🌱' } }, { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'load_skill', input: {} } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"name":' } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"Clear writing"}' } }]);
  };
  try {
    let text = '';
    const result = await sendMessage({ settings, messages: [user], system: 'Exact prompt', tools: [], signal: new AbortController().signal, onText: chunk => { text += chunk; } });
    assert.equal(text, 'Hello 🌱'); assert.equal(body.model, 'selected-model'); assert.equal(body.system, 'Exact prompt');
    assert.deepEqual(result.toolCalls, [{ id: 't1', name: 'load_skill', arguments: { name: 'Clear writing' } }]);
  } finally { globalThis.fetch = original; }
});
test('chat-completions deltas and native tool calls are accepted', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => sse([{ choices: [{ delta: { content: 'Hi ' } }] }, { choices: [{ delta: { content: 'there', tool_calls: [{ index: 0, id: 'call', function: { name: 'lookup', arguments: '{"q":' } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"topic"}' } }] } }] }]);
  try {
    const result = await sendMessage({ settings: { ...settings, apiFormat: 'chat' }, messages: [user], system: 'Prompt', tools: [], signal: new AbortController().signal, onText: () => undefined });
    assert.equal(result.content, 'Hi there'); assert.deepEqual(result.toolCalls[0].arguments, { q: 'topic' });
  } finally { globalThis.fetch = original; }
});
test('interrupted native tools get matching error results and parallel results are grouped', async () => {
  const original = globalThis.fetch;
  let sent = '';
  globalThis.fetch = async (_input, init) => { sent = String(init?.body); return sse([{ type: 'content_block_delta', delta: { text: 'Recovered.' } }]); };
  const assistant: Message = { id: 'a', role: 'assistant', content: '', attachments: [], createdAt: 2, toolCalls: ['one', 'two'].map(id => ({ id, name: 'lookup', arguments: {}, kind: 'connector', native: true, status: 'error' })) };
  try {
    await sendMessage({ settings, messages: [user, assistant], system: 'Prompt', tools: [], signal: new AbortController().signal, onText: () => undefined });
    const body = JSON.parse(sent) as { messages: Array<{ role: string; content: Array<{ type: string; is_error?: boolean }> }> };
    const last = body.messages.at(-1)!;
    assert.equal(last.role, 'user'); assert.equal(last.content.length, 2); assert.ok(last.content.every(block => block.type === 'tool_result' && block.is_error));
  } finally { globalThis.fetch = original; }
});
test('models and endpoint selection never assume a default model', async () => {
  assert.equal(apiFormat(settings), 'messages'); assert.equal(apiFormat({ ...settings, baseUrl: 'http://example.test/v1' }), 'chat');
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{ id: 'z' }, { id: 'a' }, { id: 'a' }] });
  try { assert.deepEqual(await fetchModels(settings), ['a', 'z']); }
  finally { globalThis.fetch = original; }
  await assert.rejects(sendMessage({ settings: { ...settings, model: '' }, messages: [user], system: '', tools: [], signal: new AbortController().signal, onText: () => undefined }), /Choose a model/);
});
