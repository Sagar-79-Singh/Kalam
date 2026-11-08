import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'build'), { recursive: true });
await cp(path.join(root, 'packaging'), path.join(root, 'build'), { recursive: true });
