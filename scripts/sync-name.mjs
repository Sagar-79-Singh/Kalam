import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const constants = path.join(root, 'frontend/src/constants.ts');
let source = await readFile(constants, 'utf8');
const name = source.match(/export const APP_NAME = ['"]([^'"]+)['"]/)[1];
// Release metadata changes exist only in the build workspace. No commit is made.
if (process.env.GITHUB_REF_TYPE === 'tag') {
  const version = (process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Version tags must use vMAJOR.MINOR.PATCH, optionally with a prerelease suffix.');
  source = source.replace(/export const APP_VERSION = ['"][^'"]+['"]/, `export const APP_VERSION = '${version}'`);
  await writeFile(constants, source);
}
const version = source.match(/export const APP_VERSION = ['"]([^'"]+)['"]/)[1];
for (const file of ['frontend/package.json', 'frontend/package-lock.json', 'wails.json']) {
  const full = path.join(root, file);
  const json = JSON.parse(await readFile(full, 'utf8'));
  json.name = file.includes('package') ? name.toLowerCase() : name;
  if (file.includes('package')) {
    json.version = version;
    if (json.packages?.['']) { json.packages[''].name = name.toLowerCase(); json.packages[''].version = version; }
  } else {
    json.outputfilename = name;
    json.info.productName = name;
    json.info.productVersion = version.split(/[+-]/)[0];
  }
  await writeFile(full, JSON.stringify(json, null, 2) + '\n');
}
const index = path.join(root, 'frontend/index.html');
await writeFile(index, (await readFile(index, 'utf8')).replace(/<title>.*?<\/title>/, `<title>${name}</title>`));
const readme = path.join(root, 'README.md');
await writeFile(readme, (await readFile(readme, 'utf8')).replace(/^# .*$/m, `# ${name}`));
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `PRODUCT_NAME=${name}\n`);
