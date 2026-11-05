import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

if (process.platform !== 'win32' || process.env.CI !== 'true') throw new Error('This check requires an isolated Windows CI runner and its system WebView2.');
const config = JSON.parse(await readFile('wails.json', 'utf8'));
const output = path.resolve('build/native-smoke');
await mkdir(output, { recursive: true });
const applicationLog = createWriteStream(path.join(output, 'application.log'));
const installation = await mkdtemp(path.join(os.tmpdir(), `${config.name}-install-`));
const installerName = (await readdir('build/bin')).find(file => file.endsWith('-installer.exe'));
assert.ok(installerName, 'An actual NSIS installer is required.');
const installer = path.resolve('build/bin', installerName);
const executable = path.join(installation, `${config.name}.exe`);
const appData = path.join(installation, 'isolated-appdata');
const databaseFile = path.join(appData, config.name, 'data.sqlite');
let application;
let driver;
let firstResponse;
let chatRequests = 0;
let toolCalls = 0;
let serial = 0;
const pending = new Map();
const sent = [];
let resolveCancellation;
const cancellation = new Promise(resolve => { resolveCancellation = resolve; });
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function bounded(promise, label, milliseconds = 30000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function until(check, label, milliseconds = 30000) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await delay(200);
  }
  throw new Error(`${label} timed out. ${last?.message ?? ''}`);
}
async function execute(file, args, label, milliseconds = 180000) {
  const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(applicationLog, { end: false }); child.stderr.pipe(applicationLog, { end: false });
  try { const [code] = await bounded(once(child, 'exit'), label, milliseconds); assert.equal(code, 0, `${label} failed with exit code ${code}.`); }
  catch (error) { child.kill(); throw error; }
}
async function ui(action, options = {}) {
  if (!driver || driver.exitCode !== null) throw new Error('The native accessibility driver is not running.');
  const id = ++serial;
  const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  driver.stdin.write(`${JSON.stringify({ id, processId: application.pid, action, ...options })}\n`);
  try { return await bounded(result, `Windows accessibility ${action}`, 20000); }
  finally { pending.delete(id); }
}
const normalize = text => text.replace(/\s+/g, ' ');
const text = name => until(async () => normalize(await ui('snapshot')).includes(normalize(name)), `Visible native text: ${name}`);
const click = (name, contains = false) => until(() => ui('click', { name, role: 'button', contains }), `Native button: ${name}`);
const fill = (name, value) => until(() => ui('fill', { name, role: 'input', text: value }), `Native input: ${name}`);
function records(table) {
  assert.ok(['settings', 'chats', 'messages', 'artifacts', 'memories', 'connectors'].includes(table));
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try { return db.prepare(`SELECT payload FROM ${table}`).all().map(row => JSON.parse(row.payload)); }
  finally { db.close(); }
}
function delta(response, value) { response.write(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: value } })}\n\n`); }
const canary = { id: 'native-iframe-canary', content: 'An iframe must not save this memory', enabled: true, createdAt: Date.now() };
const packet = 'C' + JSON.stringify({ name: 'main.App.PutMemory', args: [JSON.stringify(canary)], callbackID: 'native-iframe-probe' });
const artifact = `<h1>Native sandbox</h1><button onclick="this.textContent='Interactive'">Try the frame</button><button id="probe">Check native isolation</button><pre id="result"></pre><script>
  document.getElementById('probe').onclick = () => {
    let blocked = false;
    try { void parent.document.body; } catch { blocked = true; }
    const absent = typeof window.go === 'undefined' && typeof window.runtime === 'undefined';
    const packet = ${JSON.stringify(packet)};
    for (const send of [() => window.WailsInvoke(packet), () => window.external.invoke(packet), () => window.chrome.webview.postMessage(packet), () => window.webkit.messageHandlers.external.postMessage(packet)]) { try { send(); } catch {} }
    document.getElementById('result').textContent = 'Isolation: parent ' + (blocked ? 'blocked' : 'EXPOSED') + '; bindings ' + (absent ? 'absent' : 'EXPOSED') + '.';
  };
</script>`;
const upstream = createServer(async (request, response) => {
  try {
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'native-fixture' }] })); return;
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
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); return;
    }
    assert.equal(request.url, '/v1/messages');
    sent.push(body); chatRequests++;
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }); response.flushHeaders();
    if (chatRequests === 1) {
      firstResponse = response;
      // The real app must show this before EOF; split a Hindi UTF-8 character.
      const value = 'Native streaming arrived before EOF — नमस्ते.';
      const bytes = Buffer.from(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: value } })}\n\n`);
      const split = bytes.indexOf(Buffer.from('न')) + 1;
      response.write(bytes.subarray(0, split));
      setTimeout(() => { if (!response.destroyed) response.write(bytes.subarray(split)); }, 50);
    } else if (chatRequests === 2) { delta(response, 'Native tool continuation complete.'); response.end(); }
    else if (chatRequests === 3) {
      response.once('close', () => resolveCancellation(!response.writableEnded)); delta(response, 'A response you can stop.');
    } else { delta(response, 'Ready after cancellation.'); response.end(); }
  } catch (error) {
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: error.message } }));
  }
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const gateway = `http://127.0.0.1:${upstream.address().port}`;
async function launch() {
  await mkdir(appData, { recursive: true });
  const localData = path.join(installation, 'isolated-localdata'); await mkdir(localData, { recursive: true });
  application = spawn(executable, [], { cwd: installation, env: { ...process.env, APPDATA: appData, LOCALAPPDATA: localData }, stdio: ['ignore', 'pipe', 'pipe'] });
  application.stdout.pipe(applicationLog, { end: false }); application.stderr.pipe(applicationLog, { end: false });
  let spawnError; application.on('error', error => { spawnError = error; });
  await until(async () => {
    if (spawnError) throw spawnError;
    if (application.exitCode !== null) throw new Error(`The installed app exited: ${application.exitCode}.`);
    return normalize(await ui('snapshot')).includes('New chat');
  }, 'Real system WebView2 window', 45000);
  await ui('maximize');
}
async function quit() {
  if (!application || application.exitCode !== null) return;
  const exited = once(application, 'exit');
  await ui('close');
  const [code] = await bounded(exited, 'Graceful native shutdown', 15000);
  assert.equal(code, 0, 'The app should shut down cleanly.');
}
try {
  await execute(installer, ['/S', `/D=${installation}`], 'Silent NSIS installation');
  await access(executable);
  assert.equal((await readFile(executable)).subarray(0, 2).toString(), 'MZ');
  console.log('PASS real installer extracts a Windows executable');
  driver = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/windows-ui-automation.ps1')], { stdio: ['pipe', 'pipe', 'pipe'] });
  driver.stderr.pipe(applicationLog, { end: false });
  createInterface({ input: driver.stdout }).on('line', line => {
    try { const message = JSON.parse(line); const item = pending.get(message.id); if (item) message.ok ? item.resolve(message.value) : item.reject(new Error(message.error)); }
    catch { applicationLog.write(`Accessibility driver: ${line}\n`); }
  });
  const driverFailed = error => { for (const item of pending.values()) item.reject(error); };
  driver.on('error', driverFailed); driver.stdin.on('error', driverFailed);
  driver.on('exit', code => driverFailed(new Error(`The accessibility driver exited: ${code}`)));
  await launch();
  await click('Connect OmniRoute to begin', true);
  await fill('OmniRoute Base URL', `${gateway}/v1/messages`);
  await fill('Model ID', 'native-fixture');
  await click('Save connection settings');
  await click('Refresh models'); await text('1 models available');
  await click('Connectors'); await click('Add server');
  await fill('Server name', 'Native tools'); await fill('MCP server URL', `${gateway}/mcp`);
  await click('Save server'); await click('Test connection'); await text('1 tools discovered');
  await click('Close settings');
  assert.equal(records('settings')[0].model, 'native-fixture');
  console.log('PASS Wails bindings, SQLite settings, model discovery, and native MCP initialization');
  await fill('Message', 'Check the native runtime'); await click('Send message');
  await text('Native streaming arrived before EOF — नमस्ते.');
  assert.ok(firstResponse && !firstResponse.writableEnded, 'Text must be visible before the real upstream closes.');
  delta(firstResponse, `\n<artifact id="native-page" type="html" title="Native sandbox">${artifact}</artifact>\n<tool_call name="lookup" id="native-lookup">{"q":"runtime"}</tool_call>\n<load_skill name="Artifact studio"/>\n<memory>Native runtime check completed</memory>`);
  firstResponse.end();
  await text('Native tool continuation complete.');
  await until(() => records('messages').some(message => message.content.includes('Native tool continuation complete.')), 'Completed native chat persistence');
  assert.equal(toolCalls, 1);
  assert.ok(JSON.stringify(sent[1].messages).includes('Native connector result'));
  assert.ok(JSON.stringify(sent[1].messages).includes('# Artifact studio'));
  await text('Native sandbox'); await click('Try the frame'); await text('Interactive');
  await click('Check native isolation'); await text('Isolation: parent blocked; bindings absent.');
  await delay(300);
  assert.ok(!records('memories').some(memory => memory.id === canary.id), 'Raw iframe IPC must not write the canary to the real database.');
  console.log('PASS before-EOF Unicode streaming, native tools/skills, interactive iframe, and raw-IPC containment');
  await click('Close artifact panel');
  await fill('Message', 'Stop this native request'); await click('Send message');
  await text('A response you can stop.'); await click('Stop generation');
  assert.equal(await bounded(cancellation, 'Upstream request cancellation'), true);
  await fill('Message', 'Continue after stopping'); await click('Send message');
  await text('Ready after cancellation.');
  await until(() => records('messages').some(message => message.content.includes('Ready after cancellation.')), 'Native SQLite conversation persistence');
  console.log('PASS real upstream cancellation, recovery, and SQLite chat persistence');
  await ui('keys', { keys: '^,', focus: 'Message' }); await click('Appearance'); await click('Dark');
  await until(() => records('settings')[0].theme === 'dark', 'Persisted dark appearance');
  await click('Close settings');
  await ui('screenshot', { file: path.join(output, 'native-chat.png') });
  await quit(); await launch();
  await ui('screenshot', { file: path.join(output, 'native-restart.png') });
  await click('Check the native runtime', true); await text('Ready after cancellation.');
  assert.ok(records('memories').some(memory => memory.content === 'Native runtime check completed'));
  assert.equal(records('artifacts')[0].id, 'native-page');
  await ui('keys', { keys: '^,', focus: 'Message' }); await click('Appearance');
  assert.equal(await ui('pressed', { name: 'Dark', role: 'button' }), true, 'The restarted interface must hydrate its dark-theme selection.');
  await click('Memory'); await text('Native runtime check completed');
  await click('Close settings');
  console.log('PASS clean native restart, persisted dark theme, SQLite history/artifacts, and memory');
  await quit();
  await execute(path.join(installation, 'uninstall.exe'), ['/S'], 'Silent NSIS uninstallation');
  await until(async () => { try { await access(executable); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; } }, 'Installed executable removal');
  console.log('PASS real uninstaller removes the installed executable');
} catch (error) {
  const visible = driver && application ? await ui('snapshot').catch(() => '') : '';
  if (driver && application) await ui('screenshot', { file: path.join(output, 'failure.png') }).catch(() => undefined);
  const log = await readFile(path.join(output, 'application.log'), 'utf8').catch(() => '');
  const detail = [String(error.stack || error).slice(-5000), visible.slice(-8000), log.slice(-4000)].join('\n').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.error(`::error title=Native Windows runtime::${detail}`);
  throw error;
} finally {
  if (application?.exitCode === null) { application.kill(); await bounded(once(application, 'exit'), 'Cleanup', 5000).catch(() => undefined); }
  driver?.stdin.end(); if (driver?.exitCode === null) driver.kill();
  upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
  applicationLog.end();
}
