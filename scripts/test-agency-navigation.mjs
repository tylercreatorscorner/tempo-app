import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/agency/navigation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URL, Date });
const { agencyHref, completedAgencyMonth, isAgencyMonth } = exports;
assert.equal(agencyHref('/agency/revenue', '2026-10'), '/agency/revenue?month=2026-10');
assert.equal(agencyHref('/agency/finance?client=abc#invoices', '2026-10'), '/agency/finance?client=abc&month=2026-10#invoices');
assert.equal(agencyHref('/agency?month=2026-09', '2026-10'), '/agency?month=2026-10');
for (const value of [null, undefined, '', '2026-13', '2026-00', 'October', '2026-10&client=other']) {
  assert.equal(isAgencyMonth(value), false);
  assert.equal(agencyHref('/agency', value), '/agency');
}
assert.equal(completedAgencyMonth('2026-10', '2026-11'), '2026-10');
assert.equal(completedAgencyMonth('2026-11', '2026-11'), '2026-10');
assert.equal(completedAgencyMonth(undefined, '2026-01'), '2025-12');
assert.equal(completedAgencyMonth('2026-00', '2026-11'), '2026-10');
const workspace = readFileSync('src/app/(admin)/agency/workspace.tsx', 'utf8');
assert.match(workspace, /agencyHref\('\/agency\/revenue', month\)/, 'Overview revenue action carries the reviewed period');
assert.match(workspace, /window\.history\.replaceState\(null/, 'Month selection notifies Next navigation');
assert.match(readFileSync('src/components/layout/sidebar.tsx', 'utf8'), /agencyHref\(href, searchParams\.get\('month'\)\)/, 'Desktop and mobile share period-aware links');
assert.match(workspace, /target\.scrollIntoView/, 'Async unlinked-brand destination restores the hash handoff after loading');
console.log('Agency navigation: month handoffs, malformed values, and year rollover passed');
