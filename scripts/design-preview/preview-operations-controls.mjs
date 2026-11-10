// Local-only actual component preview with fictional fixtures and no live fetch.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { createServer } from 'node:http';
const output = resolve('.design-preview/operations-controls');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scripts/design-preview/operations-controls.tsx'], bundle: true, outdir: output, entryNames: 'preview', jsx: 'automatic', format: 'esm', alias: {
  'next/link': resolve('scripts/design-preview/operations-link.tsx'),
  'next/navigation': resolve('scripts/design-preview/workspace-system-navigation.ts'),
  '@/hooks/use-tenant': resolve('scripts/design-preview/operations-hooks.ts'),
  '@/hooks/use-brand-meta': resolve('scripts/design-preview/operations-hooks.ts'),
  '@/hooks/use-brand-list': resolve('scripts/design-preview/operations-hooks.ts'),
  '@/lib/supabase/client': resolve('scripts/design-preview/workspace-system-supabase.ts'),
}, define: { 'process.env.NODE_ENV': '"development"' } });
const globals = resolve('src/app/globals.css');
const theme = await postcss([tailwindcss()]).process(await readFile(globals, 'utf8'), { from: globals });
await writeFile(resolve(output, 'theme.css'), theme.css);
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo Operations local fixture</title><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');
if (!process.argv.includes('--build-only')) createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1:4188').pathname;
  const file = ['/', '/onboarding', '/chat', '/messages', '/coaching', '/reporting/coaching', '/reporting/coaching/elite', '/invoicing-fixture', '/finance-settings'].includes(path) ? 'index.html' : path.slice(1);
  if (!['index.html', 'preview.js', 'preview.css', 'theme.css'].includes(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:");
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(resolve(output, file)));
}).listen(4188, '127.0.0.1', () => console.log('Operations control fixture: http://127.0.0.1:4188/onboarding?scenario=copy-failure'));
