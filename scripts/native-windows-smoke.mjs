import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';

if (process.platform !== 'win32' || process.env.CI !== 'true') throw new Error('This check requires an isolated Windows CI runner and its system WebView2.');
const { chromium } = await import('../.build-tools/native-test/node_modules/playwright-core/index.mjs');
const config = JSON.parse(await readFile('wails.json', 'utf8'));
const output = path.resolve('build/native-smoke');
await mkdir(output, { recursive: true });
const applicationLog = createWriteStream(path.join(output, 'application.log'));
const installation = await mkdtemp(path.join(os.tmpdir(), `${config.name}-install-`));
const installerName = (await readdir('build/bin')).find(file => file.endsWith('-installer.exe'));
assert.ok(installerName, 'An actual NSIS installer is required.');
const installer = path.resolve('build/bin', installerName);
const executable = path.join(installation, `${config.name}.exe`);
let application;
let browser;
let page;
let spawnError;
let firstResponse;
let chatRequests = 0;
let toolCalls = 0;
const sent = [];
const pageErrors = [];
let resolveCancellation;
const cancellation = new Promise(resolve => { resolveCancellation = resolve; });

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function bounded(promise, label, milliseconds = 30000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function execute(file, args, label, milliseconds = 180000) {
  const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(applicationLog, { end: false });
  child.stderr.pipe(applicationLog, { end: false });
  try {
    const [code] = await bounded(once(child, 'exit'), label, milliseconds);
    assert.equal(code, 0, `${label} failed with exit code ${code}.`);
  } catch (error) { child.kill(); throw error; }
}
function delta(response, text) {
  response.write(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`);
}
function eventHeaders(response) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  response.flushHeaders();
}
const upstream = createServer(async (request, response) => {
  try {
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'native-fixture' }] }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.url === '/mcp') {
      if (body.method === 'notifications/initialized') { response.writeHead(204); response.end(); return; }
      let result = {};
      if (body.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Runtime check', version: '1' } };
      if (body.method === 'tools/list') result = { tools: [{ name: 'lookup', description: 'Check the native MCP transport', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }] };
      if (body.method === 'tools/call') { toolCalls++; result = { content: [{ type: 'text', text: 'Native connector result' }] }; }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'native-session' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
      return;
    }
    assert.equal(request.url, '/v1/messages');
    sent.push(body); chatRequests++; eventHeaders(response);
    if (chatRequests === 1) {
      firstResponse = response;
      // Split one Hindi character across writes. Keep this response open until
      // the actual webview has shown the text: buffered HTTP cannot pass.
      const text = 'Native streaming arrived before EOF — नमस्ते.';
      const bytes = Buffer.from(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`);
      const split = bytes.indexOf(Buffer.from('न')) + 1;
      response.write(bytes.subarray(0, split));
      setTimeout(() => { if (!response.destroyed) response.write(bytes.subarray(split)); }, 50);
    } else if (chatRequests === 2) {
      delta(response, 'Native tool continuation complete.'); response.end();
    } else if (chatRequests === 3) {
      response.once('close', () => resolveCancellation(!response.writableEnded));
      delta(response, 'A response you can stop.');
    } else {
      delta(response, 'Ready after cancellation.'); response.end();
    }
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: error.message } }));
  }
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const gateway = `http://127.0.0.1:${upstream.address().port}`;
async function launch() {
  const reserve = createPortServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  spawnError = undefined;
  const appData = path.join(installation, 'isolated-appdata');
  const localData = path.join(installation, 'isolated-localdata');
  await mkdir(appData, { recursive: true }); await mkdir(localData, { recursive: true });
  application = spawn(executable, [], { cwd: installation, env: { ...process.env, APPDATA: appData, LOCALAPPDATA: localData, WEBVIEW2_USER_DATA_FOLDER: path.join(installation, 'webview-profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  application.on('error', error => { spawnError = error; });
  application.stdout.pipe(applicationLog, { end: false }); application.stderr.pipe(applicationLog, { end: false });
  const deadline = Date.now() + 45000;
  let connectionError;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (application.exitCode !== null) throw new Error(`The installed app exited during startup: ${application.exitCode}.`);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 }); break; }
    catch (error) { connectionError = error; await delay(250); }
  }
  if (!browser) throw new Error('The native system webview did not start its check-only debugging endpoint.', { cause: connectionError });
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 15000 });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.waitForFunction(() => Boolean(window.go?.main?.App && window.runtime?.EventsOnMultiple));
  await page.getByRole('button', { name: 'New chat', exact: false }).first().waitFor();
}
async function quit() {
  if (!application || application.exitCode !== null) return;
  const exited = once(application, 'exit');
  await page?.evaluate(() => window.runtime.Quit()).catch(() => undefined);
  try { await bounded(exited, 'Graceful native shutdown', 15000); }
  catch { application.kill(); await bounded(exited, 'Native process exit', 10000); }
  await browser?.close().catch(() => undefined); browser = undefined;
}
try {
  await execute(installer, ['/S', `/D=${installation}`], 'Silent NSIS installation');
  await access(executable);
  assert.equal((await readFile(executable)).subarray(0, 2).toString(), 'MZ');
  console.log('PASS real installer extracts a Windows executable');
  await launch();
  await page.getByRole('button', { name: /Connect OmniRoute to begin/ }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByPlaceholder('http://localhost:20128/v1/messages').fill(`${gateway}/v1/messages`);
  await settings.getByLabel('Model ID', { exact: true }).fill('native-fixture');
  await settings.getByRole('button', { name: 'Save connection settings', exact: true }).click();
  await settings.getByRole('button', { name: 'Refresh models', exact: true }).click();
  await settings.getByText('1 models available', { exact: false }).waitFor();
  await settings.getByRole('button', { name: 'Connectors', exact: true }).click();
  await settings.getByRole('button', { name: 'Add server', exact: true }).click();
  await settings.getByPlaceholder('My workspace').fill('Native tools');
  await settings.getByPlaceholder('https://your-server.example/mcp').fill(`${gateway}/mcp`);
  await settings.getByRole('button', { name: 'Save server', exact: true }).click();
  await settings.getByRole('button', { name: 'Test connection', exact: true }).click();
  await settings.getByText('1 tools discovered', { exact: false }).waitFor();
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  console.log('PASS Wails bindings, SQLite settings, model discovery, and native MCP initialization');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Check the native runtime');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Native streaming arrived before EOF — नमस्ते.', { exact: true }).waitFor({ timeout: 15000 });
  assert.ok(firstResponse && !firstResponse.writableEnded, 'Text must be visible before the real upstream closes.');
  delta(firstResponse, '\n<artifact id="native-page" type="html" title="Native sandbox"><h1>Native sandbox</h1><button onclick="this.textContent=\'Interactive\'">Try the frame</button></artifact>\n<tool_call name="lookup" id="native-lookup">{"q":"runtime"}</tool_call>\n<load_skill name="Artifact studio"/>\n<memory>Native runtime check completed</memory>');
  firstResponse.end();
  await page.getByText('Native tool continuation complete.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
  assert.equal(toolCalls, 1);
  assert.ok(JSON.stringify(sent[1].messages).includes('Native connector result'));
  assert.ok(JSON.stringify(sent[1].messages).includes('# Artifact studio'));
  await page.frameLocator('iframe').getByRole('heading', { name: 'Native sandbox', exact: true }).waitFor();
  await page.frameLocator('iframe').getByRole('button', { name: 'Try the frame', exact: true }).click();
  await page.frameLocator('iframe').getByRole('button', { name: 'Interactive', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.go.main.App.GetChats), 'function');
  assert.equal(await page.frameLocator('iframe').locator('body').evaluate(() => typeof window.go), 'undefined');
  assert.equal(await page.frameLocator('iframe').locator('body').evaluate(() => typeof window.runtime), 'undefined');
  console.log('PASS real before-EOF Unicode streaming, native tool execution/continuation, skills, and isolated interactive iframe');
  await page.getByRole('button', { name: 'Close artifact panel', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Stop this native request');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('A response you can stop.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop generation', exact: true }).click();
  assert.equal(await bounded(cancellation, 'Upstream request cancellation'), true);
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Continue after stopping');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Ready after cancellation.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
  await page.waitForFunction(async () => JSON.parse(await window.go.main.App.GetChats()).some(chat => chat.messages.some(message => message.content.includes('Ready after cancellation.'))));
  console.log('PASS real upstream cancellation, recovery, and SQLite chat persistence');
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(async () => JSON.parse(await window.go.main.App.GetSettings()).theme === 'dark');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'native-chat.png') });
  await quit(); await launch();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const bootstrap = await page.evaluate(() => window.__KALAM_BOOTSTRAP__);
  assert.equal(bootstrap.theme, 'dark');
  assert.ok(!('apiKey' in bootstrap), 'Appearance HTML must not embed credentials.');
  await page.getByRole('button', { name: 'Check the native runtime', exact: true }).click();
  await page.getByText('Ready after cancellation.', { exact: true }).waitFor();
  const memories = await page.evaluate(async () => JSON.parse(await window.go.main.App.GetMemories()));
  assert.ok(memories.some(memory => memory.content === 'Native runtime check completed'));
  await page.screenshot({ path: path.join(output, 'native-restart.png') });
  assert.deepEqual(pageErrors, []);
  console.log('PASS native restart, persisted-theme bootstrap, history, and memory; no webview exceptions');
  await quit();
  await execute(path.join(installation, 'uninstall.exe'), ['/S'], 'Silent NSIS uninstallation');
} catch (error) {
  let visible = '';
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
    const body = await page.locator('body').innerText().catch(() => '');
    visible = body.slice(-6000);
    console.error('Native page:', visible);
  }
  const log = await readFile(path.join(output, 'application.log'), 'utf8').catch(() => '');
  const detail = [String(error.stack || error).slice(-5000), visible, log.slice(-4000)].join('\n').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.error(`::error title=Native Windows runtime::${detail}`);
  throw error;
} finally {
  if (application?.exitCode === null) { application.kill(); await bounded(once(application, 'exit'), 'Cleanup', 5000).catch(() => undefined); }
  await browser?.close().catch(() => undefined);
  upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
  applicationLog.end();
}
