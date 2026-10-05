// Isolated visual fixtures. No production route, database connection, or financial write.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
const output = resolve('.design-preview/agency');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scripts/design-preview/agency-workspace.tsx'], bundle: true, outdir: output, entryNames: 'preview', jsx: 'automatic', format: 'esm', sourcemap: true, loader: { '.woff2': 'file', '.woff': 'file' }, alias: { 'next/link': resolve('scripts/design-preview/agency-link.tsx') }, define: { 'process.env.NODE_ENV': '"development"' } });
const globals = resolve('src/app/globals.css');
const theme = await postcss([tailwindcss()]).process(await readFile(globals, 'utf8'), { from: globals });
await writeFile(resolve(output, 'theme.css'), theme.css);
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo agency workspace fixtures</title><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script type="module" src="preview.js"></script></body></html>');
console.log(output);
