import assert from 'node:assert/strict';
import test from 'node:test';
import { parseModelOutput, updateArtifacts } from '../src/lib/artifacts.ts';

const source = 'Here is your page.\n<artifact id="page" type="html" title="A page">\n<h1>Hello</h1>\n</artifact>\nA useful starting point.';
test('artifact tags are safe at every streaming boundary', () => {
  for (let length = 0; length <= source.length; length++) {
    const parsed = parseModelOutput(source.slice(0, length));
    assert.ok(!parsed.text.includes('<artifact'));
    assert.ok(!parsed.text.includes('</artifact'));
    const artifact = parsed.artifacts[0];
    if (artifact) { assert.equal(artifact.id, 'page'); assert.ok(!artifact.code.endsWith('</arti')); }
  }
  const parsed = parseModelOutput(source, true);
  assert.equal(parsed.text, 'Here is your page.\n\nA useful starting point.');
  assert.equal(parsed.artifacts[0].code, '<h1>Hello</h1>');
  assert.equal(parsed.artifacts[0].complete, true);
});
test('one version per message while streaming, a new version on a later update', () => {
  const first = updateArtifacts([], parseModelOutput(source.slice(0, source.indexOf('</artifact>'))).artifacts, 'chat', 'message-1', 1);
  const previous = structuredClone(first);
  const complete = updateArtifacts(first, parseModelOutput(source).artifacts, 'chat', 'message-1', 2);
  assert.deepEqual(first, previous, 'previous state must not be mutated');
  assert.equal(complete[0].versions.length, 1);
  const second = updateArtifacts(complete, parseModelOutput(source.replace('Hello', 'Updated')).artifacts, 'chat', 'message-2', 3);
  assert.equal(second[0].versions.length, 2);
  assert.equal(second[0].versions[0].code, '<h1>Hello</h1>');
  assert.equal(second[0].versions[1].code, '<h1>Updated</h1>');
});
test('control tags inside fenced examples are not executed', () => {
  const parsed = parseModelOutput('Example:\n```xml\n<memory>Not a real fact</memory>\n<artifact id="fake">text</artifact>\n```');
  assert.equal(parsed.memories.length, 0);
  assert.equal(parsed.artifacts.length, 0);
  assert.ok(parsed.text.includes('<memory>'));
});
test('control tags inside inline code are not executed', () => {
  const parsed = parseModelOutput('Use `<memory>example</memory>` to illustrate the syntax.');
  assert.equal(parsed.memories.length, 0);
  assert.ok(parsed.text.includes('`<memory>example</memory>`'));
});
test('memories, skills, and tools require a complete tag', () => {
  assert.equal(parseModelOutput('<memory>Half a fact').memories.length, 0);
  const result = parseModelOutput('<memory>A fact</memory><load_skill name="Clear writing"/><tool_call name="lookup" id="1">{"q":"test"}</tool_call>');
  assert.deepEqual(result.memories, ['A fact']);
  assert.deepEqual(result.skills, ['Clear writing']);
  assert.deepEqual(result.tools[0].arguments, { q: 'test' });
  assert.equal(result.text, '');
});
test('invalid tool arguments become a tool-card error rather than a crash', () => {
  const result = parseModelOutput('<tool_call name="lookup">bad json</tool_call>');
  assert.ok(result.tools[0].error);
});
