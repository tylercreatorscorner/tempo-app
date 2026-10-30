// Local-only fictional UI fixture. No authenticated requests or production writes.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { createServer } from 'node:http';
const output = resolve('.design-preview/agency-revenue');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scripts/design-preview/agency-revenue.tsx'], bundle: true, outdir: output, entryNames: 'preview', jsx: 'automatic', format: 'esm', alias: { 'next/link': resolve('scripts/design-preview/agency-link.tsx') }, define: { 'process.env.NODE_ENV': '"development"' } });
const globals = resolve('src/app/globals.css');
const theme = await postcss([tailwindcss()]).process(await readFile(globals, 'utf8'), { from: globals });
await writeFile(resolve(output, 'theme.css'), theme.css);
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo revenue local fixture</title><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="preview.css"></head><body style="font-family:Inter,Arial,sans-serif;background:var(--background);color:var(--foreground)"><div style="padding:8px 24px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted-foreground)">Local fixture · fictional data</div><div id="root" style="max-width:1440px;margin:0 auto;padding:26px 28px 35px"></div><script type="module" src="preview.js"></script></body></html>');
createServer(async (request, response) => { const path = request.url?.split('?')[0] === '/' ? 'index.html' : request.url?.split('?')[0]?.slice(1); if (!['index.html', 'preview.js', 'preview.css', 'theme.css'].includes(path)) { response.writeHead(404).end(); return; } response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await readFile(resolve(output, path))); }).listen(4185, '127.0.0.1', () => console.log('Revenue fixture: http://127.0.0.1:4185'));
