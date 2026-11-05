import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Node's type stripper does not transform JSX. Compile this small, real component
// module for server rendering without adding a browser/component test dependency.
const source = readFileSync(new URL('../src/components/ui.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, fileName: 'ui.tsx' }).outputText;
const common: { exports: unknown } = { exports: {} };
new Function('module', 'exports', 'require', compiled)(common, common.exports, createRequire(import.meta.url));
const { Field } = common.exports as { Field: (props: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) => ReactElement };

test('field labels and help text are associated with direct controls', () => {
  const html = renderToStaticMarkup(createElement(Field, { label: 'Project name', hint: 'Choose something memorable.', children: createElement('input') }));
  const labelFor = /<label[^>]*for="([^"]+)"/.exec(html)?.[1];
  const controlId = /<input[^>]*id="([^"]+)"/.exec(html)?.[1];
  const describedBy = /<input[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
  assert.ok(labelFor && describedBy);
  assert.equal(labelFor, controlId);
  assert.ok(html.includes(`id="${describedBy}"`));
});

test('nested controls retain existing IDs and description references', () => {
  const html = renderToStaticMarkup(createElement(Field, { label: 'Model ID', hint: 'Manual IDs work too.', children: createElement('div', null, createElement('input', { id: 'chosen-model', 'aria-describedby': 'existing-help' }), createElement('button', null, 'Refresh')) }));
  assert.ok(html.includes('for="chosen-model"'));
  assert.ok(html.includes('id="chosen-model"'));
  assert.match(html, /aria-describedby="existing-help [^"]+-hint"/);
  assert.ok(!html.includes('role="group"'));
  assert.ok(html.includes('Refresh'));
});

test('fields containing button choices expose a named group, not an orphan label', () => {
  const html = renderToStaticMarkup(createElement(Field, { label: 'Response style', children: createElement('div', null, createElement('button', null, 'Normal'), createElement('button', null, 'Concise')) }));
  assert.ok(html.includes('role="group"'));
  const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
  assert.ok(labelledBy && html.includes(`id="${labelledBy}"`));
  assert.ok(!html.includes('<label'));
});
