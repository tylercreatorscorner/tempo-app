import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Render the real client view with fictional model outputs. No browser or live data.
const result = await build({
  stdin: { resolveDir: resolve('.'), loader: 'tsx', contents: String.raw`
    import assert from 'node:assert/strict';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AgencyInvoiceDocument } from './src/app/(admin)/agency/finance/invoice/[id]/document';
    import { buildInvoice, emptyFinanceSettings } from './src/lib/agency/finance-model';
    import { CreatorBillingLedger } from './src/app/(admin)/agency/finance/creator-billing';
    import { calculateCreatorBilling } from './src/lib/agency/creator-billing';
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
    assert.doesNotMatch(october.html, /Review manager pay/);
    const estimate = october.html.slice(october.html.indexOf('aria-label="Revenue estimate"'));
    const summaryEnd = estimate.indexOf('</section>');
    assert.doesNotMatch(estimate.slice(0, summaryEnd), /\$0\.00/, 'unknown manager pay is never presented as a zero matched subtotal');
    assert.equal(october.row.managerCents, null);
    assert.deepEqual(october.data.cash, cash, 'no-fee classification does not change recorded cash');
    const september = render('2026-09');
    assert.equal(september.row.feeCents, 200000);
    assert.match(september.html, /Review manager pay/);
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
    assert.match(partialHtml, /Known fees and recorded share/);
    assert.match(partialHtml, /3,838.71/);
    assert.match(partialHtml, /1,645.16/);
    const novemberRow = { ...calculateRevenueTrueUp({ client: partialClient, finance: partialFinance, month: '2026-11', throughDate: '2026-11-30', gmv: { amountCents: 18000000, complete: true, recordedThrough: '2026-11-30' } }), managerRecipients: [], brandCoverage: [] };
    const novemberData = { ...october.data, month: '2026-11', periodStart: '2026-11-01', periodEnd: '2026-11-30', throughDate: '2026-11-30', rows: [novemberRow], totals: sumRevenueTrueUps([novemberRow]) };
    const novemberHtml = renderToStaticMarkup(<AgencyRevenueWorkspace initialData={novemberData} latestMonth="2026-11" />);
    assert.doesNotMatch(novemberHtml, /Approved period:|Manager pay period:/);
    assert.match(novemberHtml, /7,000/);
    assert.match(novemberHtml, /3,000/);
    const pendingClient = { ...client, name: 'Afil Example', terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 7000, revSharePercent: 7, feeModel: 'additive' }] };
    const pendingFinance = { client_id: client.id, revision: 1, settings: { termsReviewRequired: true, managerTerms: [{ effectiveMonth: '2026-10', managerId: '00000000-0000-4000-8000-000000000020', fixedMonthly: 3000, gmvPercent: 3, payoutDays: 7 }] } };
    const pendingRow = { ...calculateRevenueTrueUp({ client: pendingClient, finance: pendingFinance, month: '2026-10', throughDate: '2026-10-29', gmv: { amountCents: null, complete: false, recordedThrough: null } }), managerRecipients: [], brandCoverage: [] };
    assert.equal(pendingRow.feeCents, null);
    assert.equal(pendingRow.managerCents, null);
    assert.equal(pendingRow.knownFeeCents, 700000);
    assert.equal(pendingRow.knownManagerCents, 300000);
    assert.equal(pendingRow.knownRetainedCents, 400000);
    const pendingData = { ...october.data, rows: [pendingRow], totals: sumRevenueTrueUps([pendingRow]) };
    const pendingHtml = renderToStaticMarkup(<AgencyRevenueWorkspace initialData={pendingData} latestMonth="2026-10" />);
    assert.ok(pendingHtml.includes('Known agency fees') && pendingHtml.includes('$7,000.00') && pendingHtml.includes('$3,000.00') && pendingHtml.includes('$4,000.00'), 'known matched components remain visible while exact fee/pay totals are null');
    assert.ok(pendingHtml.includes('+ pending share') && pendingHtml.includes('Invoice approval pending'));
    assert.ok(pendingHtml.includes('Pending fees or manager pay can change the CC portion'), 'known CC difference is never described as a guaranteed minimum');
    assert.ok(pendingHtml.includes('section=manager'), 'manager setup has a direct action');
    const creatorClient = { ...client, name: 'Creator Program', terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'per_creator', creatorRate: { monthlyFee: 500, maxCreators: 50, monthlyBudgetCap: 100000 } }] };
    const ledgerProps = { client: creatorClient, onChange: () => {}, canEdit: true, currentDay: '2026-10-30', initialMonth: '2026-10' };
    const missingLedgerHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} periods={[]} />);
    assert.ok(missingLedgerHtml.includes('No roster is saved for this month') && missingLedgerHtml.includes('Missing roster data stays unknown'));
    assert.ok(!missingLedgerHtml.includes('Creator 1 handle'), 'no fake creator row is seeded');
    const emptyPeriod = { month: '2026-10', rosterConfirmed: true, headcountApproval: '', budgetApproval: '', creators: [] };
    const emptyLedgerHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} periods={[emptyPeriod]} />);
    assert.ok(emptyLedgerHtml.includes('Verified empty roster') && emptyLedgerHtml.includes('$0.00'));
    const eligibleCreator = { id: '00000000-0000-4000-8000-000000000030', handle: 'example.creator', activeFrom: '2026-10-16', activeThrough: null, approved: true, onboarded: true, tapAuthorized: true, tier: 'L3' };
    const creatorPeriod = { ...emptyPeriod, creators: [eligibleCreator] };
    const creatorResult = calculateCreatorBilling({ client: creatorClient, rate: creatorClient.terms[0].creatorRate, month: '2026-10', throughDate: '2026-10-29', period: creatorPeriod });
    const creatorLedgerHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} periods={[creatorPeriod]} />);
    assert.equal(creatorResult.creators[0].activeDays, 14);
    assert.ok(creatorLedgerHtml.includes('14 / 31') && creatorLedgerHtml.includes('Agency sourcing fees') && creatorLedgerHtml.includes('Creator stipends · separate'));
    assert.ok(creatorLedgerHtml.includes('$225.81') && creatorLedgerHtml.includes('$677.42'), 'source fee and stipend use actual dates and remain distinct');
    const unsavedLedgerHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} periods={[creatorPeriod]} persistedMonths={[]} unsavedChanges />);
    assert.ok(unsavedLedgerHtml.includes('Unsaved calculation preview') && unsavedLedgerHtml.includes('Save creator billing to update Revenue'));
    assert.ok(!unsavedLedgerHtml.includes('Recorded active days') && unsavedLedgerHtml.includes('Active days through cutoff'), 'manual unsaved entries are not labeled as recorded source data');
    const invoiceSettings = { ...emptyFinanceSettings(), agencyName: 'Example Agency', agencyAddress: '200 Example Avenue', paymentInstructions: 'Use the agreed bank reference', legalName: 'Creator Program LLC', billingEmail: 'billing@example.com', billingAddress: '100 Example Street', managerTerms: [{ effectiveMonth: '2026-10', managerId: '00000000-0000-4000-8000-000000000020', fixedMonthly: 100, gmvPercent: 0, payoutDays: 7 }], creatorBillingPeriods: [creatorPeriod] };
    const frozenInvoice = JSON.parse(JSON.stringify(buildInvoice(creatorClient, { client_id: creatorClient.id, revision: 1, settings: invoiceSettings }, '2026-10', null, '2026-11-01')));
    invoiceSettings.creatorBillingPeriods[0].creators[0] = { ...eligibleCreator, handle: 'changed.after.snapshot' };
    const documentHtml = renderToStaticMarkup(<AgencyInvoiceDocument invoice={{ id: 'EXAMPLE', month: '2026-10', status: 'draft', snapshot: frozenInvoice }} />);
    const usd = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
    assert.ok(documentHtml.includes('@example.creator') && !documentHtml.includes('changed.after.snapshot'), 'invoice renders its frozen creator roster instead of current settings');
    assert.ok(documentHtml.includes('16 / 31'), 'invoice exposes actual eligible days and calendar denominator');
    assert.ok(documentHtml.includes('Agency amount due: ' + usd(frozenInvoice.feeCents)));
    assert.ok(documentHtml.includes('Creator funding schedule · separate from agency income') && documentHtml.includes('separately invoiced by accounting') && documentHtml.includes('excluded from the agency amount due'));
    assert.ok(!documentHtml.includes(usd(frozenInvoice.creatorBilling.result.combinedCents)), 'creator funding is never added into the agency amount due');
    assert.ok(!documentHtml.includes('00000000-0000-4000-8000-000000000020'), 'internal manager recipient details remain private in the client document');
    const manyCreators = Array.from({ length: 12 }, (_, index) => ({ ...eligibleCreator, id: '00000000-0000-4000-8000-' + String(40 + index).padStart(12, '0'), handle: 'fictional_creator_' + index }));
    const fullPeriod = { ...creatorPeriod, creators: manyCreators };
    const pagedResult = calculateCreatorBilling({ client: creatorClient, rate: creatorClient.terms[0].creatorRate, month: '2026-10', throughDate: '2026-10-29', period: fullPeriod });
    const pagedHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} periods={[fullPeriod]} />);
    assert.equal((pagedHtml.match(/aria-label="Creator [0-9]+ handle"/g) ?? []).length, 8, 'large rosters render only one compact page');
    assert.ok(pagedHtml.includes('Page 1 of 2') && pagedHtml.includes('Calculations include all 12 creator rows'));
    assert.ok(pagedHtml.includes(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pagedResult.feeCents / 100)), 'pagination never truncates the calculated full-roster total');
    const duplicateLedgerHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} periods={[{ ...creatorPeriod, creators: [eligibleCreator, { ...eligibleCreator, id: '00000000-0000-4000-8000-000000000031', handle: '@EXAMPLE.CREATOR' }] }]} />);
    assert.ok(duplicateLedgerHtml.includes('Each creator handle must be unique'), 'normalized duplicate handles are surfaced before saving');
    const cappedClient = { ...creatorClient, terms: [{ ...creatorClient.terms[0], creatorRate: { monthlyFee: 500, maxCreators: 1, monthlyBudgetCap: 1000 } }] };
    const capHtml = renderToStaticMarkup(<CreatorBillingLedger {...ledgerProps} client={cappedClient} periods={[{ ...creatorPeriod, creators: [eligibleCreator, { ...eligibleCreator, id: '00000000-0000-4000-8000-000000000031', handle: 'second.creator' }] }]} />);
    assert.ok(capHtml.includes('Headcount approval') && capHtml.includes('Budget approval') && capHtml.includes('Written approvals'));
    const creatorRevenueRow = { ...calculateRevenueTrueUp({ client: creatorClient, finance: null, month: '2026-10', throughDate: '2026-10-29', gmv: { amountCents: null, complete: false, recordedThrough: null } }), managerRecipients: [], brandCoverage: [] };
    const creatorRevenueHtml = renderToStaticMarkup(<AgencyRevenueWorkspace initialData={{ ...october.data, rows: [creatorRevenueRow], totals: sumRevenueTrueUps([creatorRevenueRow]) }} latestMonth="2026-10" />);
    assert.ok(creatorRevenueHtml.includes('Manage creator billing') && creatorRevenueHtml.includes('section=creator-billing') && creatorRevenueHtml.includes('billingMonth=2026-10'));
    assert.ok(!creatorRevenueHtml.includes('href="/upload"'), 'per-creator sourcing does not ask for irrelevant GMV uploads');
    console.log('PASS revenue UI: separate no-fee records, no setup prompt or invented manager zero, effective September history, retained manager costs, unchanged cash, first-day dates approved-period annotations, known fixed/pending share creator billing states, unsaved preview labeling, full-roster pagination totals and separate frozen invoice funding schedule');
  ` },
  bundle: true, write: false, outdir: resolve('.design-preview/agency-revenue-test'), format: 'cjs', platform: 'node', jsx: 'automatic',
  loader: { '.css': 'empty' }, external: ['react', 'react-dom/server', 'react/jsx-runtime', 'radix-ui', 'lucide-react'],
  alias: { 'next/link': resolve('scripts/design-preview/agency-link.tsx') },
});
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), compiledModule, compiledModule.exports);
