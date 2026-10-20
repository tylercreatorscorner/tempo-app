// Local-only preview of production workspace components with fictional fixtures.
// No credentials, production routes, network APIs, or database access are used.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { createServer } from 'node:http';

const output = resolve('.design-preview/workspace-system');
await mkdir(output, { recursive: true });
async function rebuild() {
  await build({ entryPoints: ['scripts/design-preview/workspace-system.tsx'], bundle: true, outdir: output, entryNames: 'preview', jsx: 'automatic', format: 'esm', alias: {
    'next/link': resolve('scripts/design-preview/workspace-system-link.tsx'),
    'next/navigation': resolve('scripts/design-preview/workspace-system-navigation.ts'),
    'next/image': resolve('scripts/design-preview/workspace-system-image.tsx'),
    '@/lib/supabase/client': resolve('scripts/design-preview/workspace-system-supabase.ts'),
    '@/app/actions/switch-tenant': resolve('scripts/design-preview/workspace-system-actions.ts'),
    '@/app/actions/switch-manager': resolve('scripts/design-preview/workspace-system-actions.ts'),
  }, define: { 'process.env.NODE_ENV': '"development"' } });
  const globals = resolve('src/app/globals.css');
  const theme = await postcss([tailwindcss()]).process(await readFile(globals, 'utf8'), { from: globals });
  await writeFile(resolve(output, 'theme.css'), theme.css);
}
await rebuild();
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo workspace local fixture</title><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/preview.css"></head><body style="font-family:Inter,Arial,sans-serif"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');
let rebuilding;
createServer(async (req, res) => {
  try {
    if (req.url === '/logo/tempo-icon.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end(await readFile(resolve('public/logo/tempo-icon.svg'))); return; }
    const path = ['/', '/dashboard', '/roster', '/reporting', '/reporting/weekly', '/agency', '/agency/clients', '/agency/revenue', '/agency/finance', '/earnings', '/invoicing', '/settings', '/team'].includes(req.url?.split('?')[0]) ? 'index.html' : req.url?.slice(1).split('?')[0];
    if (!['index.html', 'preview.js', 'preview.css', 'theme.css'].includes(path)) { res.writeHead(404).end(); return; }
    // Reloading any page rebuilds against the latest shared styles.
    if (path === 'index.html') { rebuilding ??= rebuild().finally(() => { rebuilding = null; }); await rebuilding; }
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(resolve(output, path)));
  } catch (error) { console.error(error); res.writeHead(500).end('Preview build failed. See local console.'); }
}).listen(4183, '127.0.0.1', () => console.log('Workspace fixture: http://127.0.0.1:4183'));
