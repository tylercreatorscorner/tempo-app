import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Render the real client view with fictional model outputs. No browser or live data.
const result = await build({
  stdin: { resolveDir: resolve('.'), loader: 'tsx', contents: String.raw`
    import assert from 'node:assert/strict';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AgencyRevenueWorkspace } from './src/app/(admin)/agency/revenue/workspace';
    import { calculateRevenueTrueUp, sumRevenueTrueUps } from './src/lib/agency/revenue-model';
    const client = { id: '00000000-0000-4000-8000-000000000009', revision: 1, name: 'Pacific Collective', brandIds: [], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [
      { effectiveMonth: '2026-01', monthlyRetainer: 2000, revSharePercent: 0, feeModel: 'fixed' },
      { effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' },
    ] };
    const cash = { collectedCents: 0, managerPaidCents: 0, retainedCashCents: 0, collectedCount: 0, managerPaidCount: 0, complete: true };
    function render(month, finance = null, firstDay = false) {
      const throughDate = firstDay ? '2026-09-30' : month === '2026-10' ? '2026-10-28' : '2026-09-30';
      const row = { ...calculateRevenueTrueUp({ client, finance, month, throughDate, gmv: { amountCents: null, complete: false, recordedThrough: null } }), managerRecipients: [], brandCoverage: [] };
      const data = { month, periodStart: month + '-01', periodEnd: month === '2026-10' ? '2026-10-31' : '2026-09-30', asOfDate: firstDay ? '2026-10-01' : '2026-10-29', throughDate, rows: [row], totals: sumRevenueTrueUps([row]), cash: firstDay ? { ...cash, collectedCents: null, managerPaidCents: null, retainedCashCents: null, complete: false } : cash, warnings: [] };
      return { row, data, html: renderToStaticMarkup(<AgencyRevenueWorkspace initialData={data} latestMonth="2026-10" />) };
    }
    const october = render('2026-10');
    assert.equal(october.row.status, 'no_agency_fee');
    const table = october.html.slice(october.html.indexOf('<tbody>'), october.html.indexOf('</tbody>'));
    assert.doesNotMatch(table, /Pacific Collective/);
    assert.match(october.html, /No agency fees <span>1<\/span>/);
    assert.match(october.html, /Confirmed \$0 agency fee.*Oct 2026/);
    assert.doesNotMatch(october.html, /Review setup/);
    const estimate = october.html.slice(october.html.indexOf('aria-label="Revenue estimate"'));
    const summaryEnd = estimate.indexOf('</section>');
    assert.doesNotMatch(estimate.slice(0, summaryEnd), /\$0\.00/, 'unknown manager pay is never presented as a zero matched subtotal');
    assert.equal(october.row.managerCents, null);
    assert.deepEqual(october.data.cash, cash, 'no-fee classification does not change recorded cash');
    const september = render('2026-09');
    assert.equal(september.row.feeCents, 200000);
    assert.match(september.html, /Review setup/);
    assert.doesNotMatch(september.html, /No agency fees <span>/, 'October terms do not hide September setup or fees');
    const paidManager = render('2026-10', { client_id: client.id, revision: 1, settings: { termsReviewRequired: false, managerTerms: [{ effectiveMonth: '2026-10', managerId: '00000000-0000-4000-8000-000000000020', fixedMonthly: 200, gmvPercent: 0, payoutDays: 7 }] } });
    assert.equal(paidManager.row.retainedCents, -20000);
    assert.match(paidManager.html, /-\$200\.00/);
    assert.doesNotMatch(paidManager.html, /No agency fees <span>/, 'a real manager cost remains in the active revenue table');
    const firstDay = render('2026-10', null, true);
    assert.match(firstDay.html, /No closed cash dates in October 2026 yet/);
    assert.doesNotMatch(firstDay.html, /Oct 1[–-]Sep 30/);
    const servicePeriod = { start: '2026-10-15', end: '2026-10-31' };
    const partialClient = { ...client, name: 'Lumen Nutrition', serviceStart: '2026-10-15', terms: [
      { effectiveMonth: '2026-10', monthlyRetainer: 3838.71, revSharePercent: 3, feeModel: 'components', managerComponent: { monthlyRetainer: 1645.16, revSharePercent: 2, feeModel: 'additive' }, servicePeriod },
      { effectiveMonth: '2026-11', monthlyRetainer: 7000, revSharePercent: 3, feeModel: 'components', managerComponent: { monthlyRetainer: 3000, revSharePercent: 2, feeModel: 'additive' } },
    ] };
    const partialFinance = { client_id: client.id, revision: 1, settings: { termsReviewRequired: false, managerTerms: [
      { effectiveMonth: '2026-10', managerId: '00000000-0000-4000-8000-000000000020', fixedMonthly: 1645.16, gmvPercent: 2, payoutDays: 7, servicePeriod },
      { effectiveMonth: '2026-11', managerId: '00000000-0000-4000-8000-000000000020', fixedMonthly: 3000, gmvPercent: 2, payoutDays: 7 },
    ] } };
    const partialRow = { ...calculateRevenueTrueUp({ client: partialClient, finance: partialFinance, month: '2026-10', throughDate: '2026-10-28', gmv: { amountCents: 18000000, complete: true, recordedThrough: '2026-10-28', periodStart: '2026-10-15', periodEnd: '2026-10-28' } }), managerRecipients: [{ managerId: '00000000-0000-4000-8000-000000000020', name: 'Jordan Example' }], brandCoverage: [] };
    const partialData = { ...october.data, rows: [partialRow], totals: sumRevenueTrueUps([partialRow]) };
    const partialHtml = renderToStaticMarkup(<AgencyRevenueWorkspace initialData={partialData} latestMonth="2026-10" />);
    assert.equal(partialRow.status, 'provisional');
    assert.match(partialHtml, /Approved period: Oct 15–Oct 31, 2026/);
    assert.match(partialHtml, /Approved service period: Oct 15–Oct 31, 2026/);
    assert.match(partialHtml, /Manager pay period: Oct 15–Oct 31, 2026/);
    assert.match(partialHtml, /Saved fixed fees plus recorded GMV share/);
    assert.match(partialHtml, /3,838.71/);
    assert.match(partialHtml, /1,645.16/);
    const novemberRow = { ...calculateRevenueTrueUp({ client: partialClient, finance: partialFinance, month: '2026-11', throughDate: '2026-11-30', gmv: { amountCents: 18000000, complete: true, recordedThrough: '2026-11-30' } }), managerRecipients: [], brandCoverage: [] };
    const novemberData = { ...october.data, month: '2026-11', periodStart: '2026-11-01', periodEnd: '2026-11-30', throughDate: '2026-11-30', rows: [novemberRow], totals: sumRevenueTrueUps([novemberRow]) };
    const novemberHtml = renderToStaticMarkup(<AgencyRevenueWorkspace initialData={novemberData} latestMonth="2026-11" />);
    assert.doesNotMatch(novemberHtml, /Approved period:|Manager pay period:/);
    assert.match(novemberHtml, /7,000/);
    assert.match(novemberHtml, /3,000/);
    console.log('PASS revenue UI: separate no-fee records, no setup prompt or invented manager zero, effective September history, retained manager costs, unchanged cash, first-day dates and approved-period annotations with normal November terms');
  ` },
  bundle: true, write: false, outdir: resolve('.design-preview/agency-revenue-test'), format: 'cjs', platform: 'node', jsx: 'automatic',
  loader: { '.css': 'empty' }, external: ['react', 'react-dom/server', 'react/jsx-runtime', 'radix-ui', 'lucide-react'],
  alias: { 'next/link': resolve('scripts/design-preview/agency-link.tsx') },
});
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), compiledModule, compiledModule.exports);
