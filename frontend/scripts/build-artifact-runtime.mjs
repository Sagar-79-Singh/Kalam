import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({
  configFile: false, logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: { write: false, target: 'es2020', minify: true, lib: { entry: 'src/lib/artifact-runtime.tsx', name: 'KalamPreviewRuntime', formats: ['iife'] } }
});
const output = Array.isArray(result) ? result[0].output : result.output;
await mkdir('public', { recursive: true });
await writeFile('public/artifact-runtime.js', output.filter(part => part.type === 'chunk').map(part => part.code).join('\n'));
