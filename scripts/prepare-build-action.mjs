import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Keep the requested v2.2 build implementation. A direct remote `uses` fails
// during GitHub job setup because v2.2 references the retired artifact service,
// even when its package input is false. A local copy is resolved after patching.
const endpoint = 'https://api.github.com/repos/dAppServer/wails-build-action/contents/action.yml?ref=v2.2';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'desktop-release-build' };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
const response = await fetch(endpoint, { headers });
if (!response.ok) throw new Error(`Could not load pinned Wails build action: HTTP ${response.status}`);
const document = await response.json();
if (typeof document.content !== 'string') throw new Error('The pinned action has no manifest.');
let source = Buffer.from(document.content, 'base64').toString('utf8');
function replaceRequired(before, after) {
  if (!source.includes(before)) throw new Error(`The v2.2 manifest changed; expected compatibility target: ${before}`);
  source = source.replaceAll(before, after);
}
replaceRequired('actions/upload-artifact@v3', 'actions/upload-artifact@v4');
replaceRequired('sudo apt-get update && sudo apt-get install libgtk-3-0 libwebkit2gtk-4.0-dev gcc-aarch64-linux-gnu', 'sudo apt-get update && sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev build-essential pkg-config');
replaceRequired("- name: Install macOS Wails deps\n      if: runner.os == 'macOS'", "- name: Install macOS Wails deps\n      if: runner.os == 'macOS' && inputs.sign != 'false'");
const directory = path.resolve('.build-tools/wails-build-action');
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'action.yml'), source);
console.log('Prepared the pinned v2.2 Wails build implementation with current runner compatibility.');
