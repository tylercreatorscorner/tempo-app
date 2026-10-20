// Local-only fictional fixtures. No authenticated requests or production writes.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { createServer } from 'node:http';
const output = resolve('.design-preview/agency-finance');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scripts/design-preview/agency-finance.tsx'], bundle: true, outdir: output, entryNames: 'preview', jsx: 'automatic', format: 'esm', alias: { 'next/link': resolve('scripts/design-preview/agency-link.tsx') }, define: { 'process.env.NODE_ENV': '"development"' } });
const globals = resolve('src/app/globals.css');
const theme = await postcss([tailwindcss()]).process(await readFile(globals, 'utf8'), { from: globals });
await writeFile(resolve(output, 'theme.css'), theme.css);
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo finance local fixture</title><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="preview.css"></head><body style="font-family:Inter,Arial,sans-serif;background:#f8f9fc"><div style="padding:12px;background:#e4e9ff">Local fixture · fictional data</div><div id="root"></div><script type="module" src="preview.js"></script></body></html>');
createServer(async (req, res) => { const path = req.url === '/' ? 'index.html' : req.url?.slice(1); if (!['index.html', 'preview.js', 'preview.css', 'theme.css'].includes(path)) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await readFile(resolve(output, path))); }).listen(4182, '127.0.0.1', () => console.log('Finance fixture: http://127.0.0.1:4182'));
