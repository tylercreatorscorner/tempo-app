import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
const creators = [
  { name: 'Known units', handle: 'known', orders: 2, items: 5, gmv: 10 },
  { name: 'Missing units', handle: 'missing', orders: 2, gmv: 10 },
  { name: 'Zero units', handle: 'zero', orders: 2, items: 0, unitsSold: 9, gmv: 10 },
  { name: 'Alternate units', handle: 'alternate', orders: 2, unitsSold: 7, gmv: 10 },
  { name: 'Canonical units', handle: 'canonical', orders: 2, units: 11, gmv: 10 },
].map(row => ({ ...row, isAffiliate: false, retainer: 300, quota: 30, ccStartDate: '2026-08-01', postsPublished: 3, videosEarning: 1 }));
let revoked = false;
const snapshot = { report: { startDate: new Date('2026-09-01T12:00:00Z'), endDate: new Date('2026-09-30T12:00:00Z'), granular: { creators } } };
const before = JSON.stringify(snapshot);
const query = { select() { return query; }, eq() { return query; }, async maybeSingle() { return { data: { brand_name: 'Alpha', snapshot, revoked_at: revoked ? '2026-10-02' : null }, error: null }; } };
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/report-csv/[token]/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date, console, require: name => {
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === '@/lib/supabase/server') return { createAdminClient: async () => ({ from: table => { assert.equal(table, 'client_reports'); return query; } }) };
  assert.equal(name, '@/lib/data/client-reports'); return { reviveReportDates: report => report };
} });
const get = () => exports.GET(new NextRequest('https://tempo.invalid/api/report-csv/fixture-token'), { params: Promise.resolve({ token: 'fixture-token' }) });
let response = await get(); assert.equal(response.status, 200);
const lines = (await response.text()).replace(/^\uFEFF/, '').trim().split('\r\n').map(line => line.split(','));
const headers = lines[0]; const unitsIndex = headers.indexOf('Units sold'), ordersIndex = headers.indexOf('Orders');
assert.deepEqual(lines.slice(1).map(line => line[unitsIndex]), ['5', '', '0', '7', '11']);
assert.deepEqual(lines.slice(1).map(line => line[ordersIndex]), ['2', '2', '2', '2', '2']);
assert.equal(lines[1][headers.indexOf('Retainer rate')], '300.00');
assert.equal(lines[1][headers.indexOf('Agreed posts')], '30');
assert.equal(lines[1][headers.indexOf('Partnership start date')], '2026-08-01');
assert.equal(JSON.stringify(snapshot), before, 'CSV may not mutate the frozen snapshot');
revoked = true; response = await get(); assert.equal(response.status, 404);
console.log('PASS report CSV units: frozen items/unitsSold fields, actual zero vs absent, order independence, agreement/date parity and revoked-link denial');
