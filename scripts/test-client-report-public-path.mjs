import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/supabase/middleware.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, process: { env: { NODE_ENV: 'production' } }, require: name => {
  if (name === 'next/server') return { NextResponse };
  assert.equal(name, '@supabase/ssr');
  return { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) };
} });
for (const path of ['/r/public-report-token?preview=1', '/api/report-media/public-report-token?url=valid', '/api/report-videos/public-report-token']) {
  const result = await exports.updateSession(new NextRequest('https://tempo.invalid' + path));
  assert.equal(result.status, 200, 'Report readers may reach each token-authorized handler without an app account');
  assert.equal(result.headers.get('location'), null);
}
for (const path of ['/api/report-media-admin', '/api/report-media', '/api/client-reports', '/api/dashboard/video-cover', '/agency/revenue']) {
  const result = await exports.updateSession(new NextRequest('https://tempo.invalid' + path));
  assert.equal(result.status, 307, 'Report artwork must not make other app or admin routes public');
  assert.equal(new URL(result.headers.get('location')).pathname, '/login');
}
console.log('PASS report public paths: anonymous readers reach token handlers, adjacent/admin/agency/dashboard routes retain authentication');
