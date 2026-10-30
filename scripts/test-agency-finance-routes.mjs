import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
const require = createRequire(import.meta.url), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const origin = 'https://fixture.invalid';
const owner = { userId: id(1), tenantId: id(2), role: 'owner', canViewFinance: true, brandScope: { kind: 'all' }, permissions: new Set(['reporting:read', 'earnings:read', 'earnings:configure']) };
let scope = owner, calls = [], rows = {}, rpcRows = {}, wrongCount = false;
const db = {
  from(table) {
    const filters = [], query = {
      select() { return query; }, eq(k, v) { filters.push([k, v]); return query; }, in() { return query; }, limit() { return query; }, order() { return query; },
      insert(payload) { calls.push({ insert: table, payload }); return Promise.resolve({ error: null }); },
      maybeSingle() { query.single = true; return query; },
      then(resolve, reject) { calls.push({ table, filters }); const data = rows[table] ?? []; return Promise.resolve({ data: query.single ? data[0] ?? null : data, error: null, count: wrongCount ? 1001 : data.length }).then(resolve, reject); },
    }; return query;
  },
  rpc(name, args) { calls.push({ name, args }); const promise = Promise.resolve(rpcRows[name] ?? { data: [], error: null }); promise.abortSignal = () => promise; return promise; },
  storage: { from(bucket) { assert.equal(bucket, 'agency-contracts'); return { createSignedUrl: async (path, seconds) => { calls.push({ path, seconds }); return { data: { signedUrl: 'https://fixture.invalid/private-download' }, error: null }; } }; } },
};
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {}, code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, process: { env: {} }, Date, Intl, Buffer, File, AbortSignal, console, require: name => {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === '@/lib/auth/workspace-scope') return { getWorkspaceScope: async () => scope };
    if (name === '@/lib/supabase/server') return { createAdminClient: async () => { calls.push({ admin: true }); return db; } };
    if (name === '@/lib/agency/access') return load('src/lib/agency/access.ts');
    if (name === '@/lib/auth/workspace-scope-types') return {};
    if (name === '@/lib/auth/can') return { can: (s, screen, level) => s.permissions.has(`${screen}:${level}`) };
    if (name === '@/lib/agency/finance-model') return load('src/lib/agency/finance-model.ts');
    if (name === '@/lib/agency/creator-billing' || name === './creator-billing') return load('src/lib/agency/creator-billing.ts');
    if (name === '@/lib/agency/model' || name === './model') return load('src/lib/agency/model.ts');
    if (name.includes('permissions')) return { can: (s, screen, level) => s.permissions.has(`${screen}:${level}`) };
    return require(name);
  } }); modules.set(path, exports); return exports;
}
const finance = load('src/app/api/agency/finance/route.ts'), contracts = load('src/app/api/agency/contracts/route.ts');
const post = (body, requestOrigin = origin) => finance.POST(new NextRequest(`${origin}/api/agency/finance`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const contractPost = (body, requestOrigin = origin) => contracts.POST(new NextRequest(`${origin}/api/agency/contracts`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
for (const rejected of [null, { ...owner, role: 'manager' }, { ...owner, canViewFinance: false }, { ...owner, impersonating: true }, { ...owner, brandScope: { kind: 'assigned', brandIds: [] } }]) {
  scope = rejected; calls = []; assert.ok([401, 403].includes((await finance.GET()).status)); assert.ok([401, 403].includes((await post({})).status)); assert.ok([401, 403].includes((await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`))).status)); assert.equal(calls.length, 0);
  assert.ok([401, 403].includes((await contractPost({})).status)); assert.equal(calls.length, 0);
}
scope = owner; calls = [];
assert.equal((await post({}, 'https://foreign.invalid')).status, 403); assert.equal(calls.length, 0);
assert.equal((await post({ action: 'draft', clientId: id(3), month: '2026-09', snapshot: { feeCents: 1 } })).status, 400, 'caller cannot provide invoice amounts');
assert.equal((await finance.GET()).status, 200);
assert.ok(calls.filter(c => c.table).every(c => c.filters.some(([k, v]) => k === 'tenant_id' && v === owner.tenantId)));
wrongCount = true; assert.equal((await finance.GET()).status, 503); wrongCount = false;
const model = load('src/lib/agency/finance-model.ts');
const settings = model.emptyFinanceSettings();
rpcRows.agency_finance_write = { data: { revision: 1 }, error: null };
assert.equal((await post({ action: 'settings', clientId: id(3), expectedRevision: 0, settings })).status, 200);
const write = calls.findLast(c => c.name === 'agency_finance_write'); assert.equal(write.args.p_tenant_id, owner.tenantId); assert.equal(write.args.p_actor_id, owner.userId);
rpcRows.agency_finance_write = { data: null, error: { message: 'Invalid historical finance client' } };
calls = [];
const historicalIssue = await post({ action: 'issue', id: id(8), expectedRevision: 1 });
assert.equal(historicalIssue.status, 400);
assert.match((await historicalIssue.json()).error, /Past agreements cannot create or issue invoices/);
const guardedIssue = calls.find(c => c.name === 'agency_finance_write');
assert.equal(guardedIssue.args.p_action, 'issue');
assert.equal(guardedIssue.args.p_payload.expectedRevision, 1);
assert.equal(guardedIssue.args.p_tenant_id, owner.tenantId);
assert.equal(guardedIssue.args.p_actor_id, owner.userId);
const historicalClient = { id: id(3), revision: 2, name: 'Historical client', historical: true, brandIds: [id(4)], serviceStart: null, serviceEnd: null, exitReason: null, terms: [], updatedAt: null };
rpcRows.agency_business_list_clients = { data: [historicalClient], error: null };
rpcRows.agency_business_month_performance = { data: [{ brand_id: id(4), managed_gmv: 100000, complete: true }], error: null };
rows.agency_finance_settings = [{ client_id: id(3), revision: 1, settings }];
calls = [];
const historicalDraft = await post({ action: 'draft', clientId: id(3), month: '2025-12' });
assert.equal(historicalDraft.status, 400);
assert.match((await historicalDraft.json()).error, /Past agreements/);
assert.ok(!calls.some(c => c.name === 'agency_finance_write'), 'the API refuses a new historical draft before writing');
for (const action of ['collect', 'pay']) {
  rpcRows.agency_finance_write = { data: { status: 'paid', revision: 4 }, error: null };
  calls = [];
  assert.equal((await post({ action, id: id(8), expectedRevision: 3, date: '2026-01-12' })).status, 200, 'existing historical obligations still reach the guarded transition RPC');
  assert.equal(calls.find(c => c.name === 'agency_finance_write').args.p_action, action);
}
const creatorRate = { monthlyFee: 500, maxCreators: 50, monthlyBudgetCap: 100000 };
const billingPeriod = { month: '2025-12', rosterConfirmed: true, headcountApproval: '', budgetApproval: '', creators: [
  { id: id(50), handle: '@FIXTURE', activeFrom: '2025-12-01', activeThrough: null, approved: true, onboarded: true, tapAuthorized: true, tier: 'L4' },
] };
const creatorClient = { ...historicalClient, historical: false, revision: 3, serviceStart: '2025-12-15', brandIds: [], terms: [{ effectiveMonth: '2025-12', feeModel: 'per_creator', monthlyRetainer: 0, revSharePercent: 0, creatorRate }] };
const creatorSettings = { ...settings, agencyName: 'Fixture Agency', agencyAddress: 'Fixture', paymentInstructions: 'Fixture only', legalName: 'Fixture Client', billingEmail: 'fixture@example.invalid', billingAddress: 'Fixture', managerTerms: [{ effectiveMonth: '2025-12', managerId: id(20), fixedMonthly: 100, gmvPercent: 0, payoutDays: 7, servicePeriod: { start: '2025-12-15', end: '2025-12-31' } }], creatorBillingPeriods: [billingPeriod] };
rpcRows.agency_business_list_clients = { data: [creatorClient], error: null };
rows.agency_finance_settings = [{ client_id: id(3), revision: 4, settings: creatorSettings }];
rpcRows.agency_finance_write = { data: { revision: 1 }, error: null };
calls = [];
assert.equal((await post({ action: 'draft', clientId: id(3), month: '2025-12' })).status, 200);
const creatorDraft = calls.find(c => c.name === 'agency_finance_write').args.p_payload.snapshot;
assert.equal(creatorDraft.feeCents, 27419); assert.equal(creatorDraft.creatorBilling.result.stipendCents, 191935);
assert.equal(creatorDraft.managerCents, 10000); assert.equal(creatorDraft.gmvCents, null);
assert.equal(creatorDraft.creatorBilling.settingsRevision, 4); assert.equal(creatorDraft.creatorBilling.period.creators[0].handle, 'fixture');
assert.ok(!calls.some(c => ['agency_business_month_performance', 'agency_business_range_performance'].includes(c.name)), 'Per-creator sourcing and fixed manager pay require no invented GMV or source query');
for (const overrides of [{ managerTerms: [] }, { managerTerms: [{ ...creatorSettings.managerTerms[0], servicePeriod: undefined }] }, { creatorBillingPeriods: [{ ...billingPeriod, rosterConfirmed: false }] }, { termsReviewRequired: true }, { billingEmail: '' }]) {
  rows.agency_finance_settings = [{ client_id: id(3), revision: 4, settings: { ...creatorSettings, ...overrides } }]; calls = [];
  assert.equal((await post({ action: 'draft', clientId: id(3), month: '2025-12' })).status, 400);
  assert.ok(!calls.some(c => c.name === 'agency_finance_write'), 'Missing pay, unapproved partial pay, unconfirmed roster and billing/review blockers cannot reserve an invoice');
}
rows.agency_finance_settings = [{ client_id: id(3), revision: 4, settings: creatorSettings }];
calls = [];
const legacyCreatorSettings = { ...creatorSettings }; delete legacyCreatorSettings.creatorBillingPeriods;
assert.equal((await post({ action: 'settings', clientId: id(3), expectedRevision: 4, settings: legacyCreatorSettings })).status, 200);
assert.equal(Object.hasOwn(calls.find(c => c.name === 'agency_finance_write').args.p_payload.settings, 'creatorBillingPeriods'), false, 'Old settings caller omission remains distinct from an explicit ledger clear');
calls = [];
assert.equal((await post({ action: 'settings', clientId: id(3), expectedRevision: 4, settings: { ...creatorSettings, creatorBillingPeriods: [] } })).status, 200);
assert.deepEqual(calls.find(c => c.name === 'agency_finance_write').args.p_payload.settings.creatorBillingPeriods, []);
const annualLedger = Array.from({ length: 12 }, (_, index) => ({ ...billingPeriod, month: `2025-${String(index + 1).padStart(2, '0')}`, creators: Array.from({ length: 50 }, (_, creatorIndex) => ({ ...billingPeriod.creators[0], id: id(100 + creatorIndex), handle: `fixture${creatorIndex}` })) }));
const annualBody = { action: 'settings', clientId: id(3), expectedRevision: 4, settings: { ...creatorSettings, creatorBillingPeriods: annualLedger } };
assert.ok(JSON.stringify(annualBody).length > 100000);
assert.equal((await post(annualBody)).status, 200, 'A normal year of 50 monthly creators can be saved within the bounded request size');
calls = [];
assert.equal((await finance.POST(new NextRequest(`${origin}/api/agency/finance`, { method: 'POST', headers: { origin }, body: ' '.repeat(4000001) }))).status, 413);
assert.ok(!calls.some(c => c.name === 'agency_finance_write'));
rows.agency_contracts = [{ storage_path: 'tenant/client/file.pdf', name: 'signed.pdf' }]; calls = [];
assert.equal((await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`))).status, 200);
assert.equal(calls.find(c => c.seconds).seconds, 60); assert.ok(calls.find(c => c.table).filters.some(([k, v]) => k === 'tenant_id' && v === owner.tenantId));
rows.agency_contracts = []; calls = [];
assert.equal((await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`))).status, 404); assert.ok(!calls.some(c => c.path));
const sourceUrl = 'https://drive.google.com/file/d/original_private_file_123/view';
rows.agency_contracts = [{ storage_path: null, source_url: sourceUrl, name: 'Original signed contract' }]; calls = [];
const opened = await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`));
assert.equal(opened.status, 200); assert.deepEqual(await opened.json(), { url: sourceUrl, source: 'google_drive' });
assert.ok(!calls.some(c => c.path), 'Drive references must not enter the storage download path');
assert.ok(calls.find(c => c.table).filters.some(([k, v]) => k === 'tenant_id' && v === owner.tenantId));
assert.equal((await contractPost({ action: 'extract', id: id(9) })).status, 409, 'linked documents need manual review instead of arbitrary URL fetching');
const extraction = { findings: [{ field: 'Legal entity', value: 'Fixture LLC', quote: 'Fixture LLC', page: 1 }], uncertainties: [] };
rows.agency_contracts[0].extraction = extraction;
assert.deepEqual(await (await contractPost({ action: 'extract', id: id(9) })).json(), extraction, 'reviewed findings remain accessible without an AI API key');
const link = { action: 'link', clientId: id(3), name: 'Original signed contract', sourceUrl };
calls = []; assert.equal((await contractPost(link, 'https://foreign.invalid')).status, 403); assert.equal(calls.length, 0);
for (const badUrl of [sourceUrl.replace('https:', 'http:'), sourceUrl.replace('drive.google.com', 'drive.google.com.evil.invalid'), sourceUrl.replace('drive.google.com', 'user:pass@drive.google.com'), `${sourceUrl}?download=1`, `${sourceUrl}#fragment`, `${sourceUrl}\n`, 'https://docs.google.com/document/d/document_123/edit', 'javascript:alert(1)']) {
  calls = []; assert.equal((await contractPost({ ...link, sourceUrl: badUrl })).status, 400); assert.ok(!calls.some(c => c.insert));
}
calls = []; assert.equal((await contractPost({ ...link, tenantId: id(99) })).status, 400); assert.ok(!calls.some(c => c.insert), 'caller cannot choose a tenant or actor');
rpcRows.agency_business_list_clients = { data: [{ id: id(99) }], error: null };
calls = []; assert.equal((await contractPost(link)).status, 404); assert.ok(!calls.some(c => c.insert), 'a contract cannot be linked to a client outside the verified tenant list');
rpcRows.agency_business_list_clients = { data: [{ id: id(3) }], error: null };
calls = []; assert.equal((await contractPost(link)).status, 200);
const linked = calls.find(c => c.insert); assert.equal(linked.insert, 'agency_contracts');
assert.equal(linked.payload.tenant_id, owner.tenantId); assert.equal(linked.payload.uploaded_by, owner.userId); assert.equal(linked.payload.client_id, id(3));
assert.equal(linked.payload.storage_path, null); assert.equal(linked.payload.source_url, sourceUrl);
assert.equal(calls.find(c => c.name === 'agency_business_list_clients').args.p_tenant_id, owner.tenantId);
console.log('PASS agency finance routes: leadership guards, origin, strict commands and Drive URL validation, tenant and actor scope, complete reads, private downloads, original Drive references and reviewed findings');
