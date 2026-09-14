// Uses the esbuild version already installed through tsx. No production route or data client.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('.design-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scripts/design-preview/creator-performance.tsx'], bundle: true, outdir: output, entryNames: 'preview', jsx: 'automatic', format: 'esm', sourcemap: true });
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo creator components</title><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script type="module" src="preview.js"></script></body></html>');
console.log(output);
