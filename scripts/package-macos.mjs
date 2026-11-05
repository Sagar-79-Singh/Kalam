import { cp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const config = JSON.parse(await readFile('wails.json', 'utf8'));
const name = config.name;
const bundle = path.resolve('build/bin', `${name}.app`);
const staging = path.resolve('build/dmg');
function run(command, args) {
  try {
    const output = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (output) process.stdout.write(output);
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').slice(-14000);
    process.stderr.write(detail + '\n');
    const escaped = detail.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=macOS packaging (${command})::${escaped}`);
    throw new Error(`${command} failed while packaging the desktop app.`, { cause: error });
  }
}
run('plutil', ['-lint', path.join(bundle, 'Contents/Info.plist')]);
run('lipo', ['-verify_arch', 'x86_64', 'arm64', path.join(bundle, 'Contents/MacOS', name)]);
// Apple silicon requires code integrity. This is an ad-hoc local signature, not
// Developer-ID signing or notarization, and needs no certificate or account.
run('codesign', ['--force', '--deep', '--sign', '-', bundle]);
run('codesign', ['--verify', '--deep', '--strict', bundle]);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(bundle, path.join(staging, `${name}.app`), { recursive: true, preserveTimestamps: true });
await symlink('/Applications', path.join(staging, 'Applications'));
run('hdiutil', ['create', '-volname', name, '-srcfolder', staging, '-ov', '-format', 'UDZO', path.resolve('build/bin', `${name}-macos-universal.dmg`)]);
