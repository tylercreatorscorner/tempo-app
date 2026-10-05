import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const foreignTenant = '22222222-2222-4222-8222-222222222222';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const numericKeys = ['managed_gmv', 'prior_managed_gmv'];

try {
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.brands_v2 (
      id uuid PRIMARY KEY, tenant_id uuid, slug text, parent_brand_id uuid,
      is_archived boolean DEFAULT false
    );
    CREATE TABLE public.managed_creators (
      id bigint GENERATED ALWAYS AS IDENTITY, tenant_id uuid, creator_id uuid,
      brand text, reporting_start_date date, archived_at timestamptz,
      ${Array.from({ length: 10 }, (_, i) => `account_${i + 1} text`).join(',')}
    );
    CREATE TABLE public.tiktok_accounts (tenant_id uuid, creator_id uuid, tiktok_username text);
    CREATE TABLE public.creator_performance (
      tenant_id uuid, brand text, creator_name text, report_date date,
      period_type text, gmv numeric
    );
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261004192715_agency_business_performance.sql', import.meta.url), 'utf8'));

  async function brand(n, slug, options = {}) {
    await db.query('INSERT INTO brands_v2 VALUES ($1,$2,$3,$4,$5)', [
      id(n), options.tenant ?? tenant, slug, options.parent ? id(options.parent) : null, options.archived ?? false,
    ]);
  }
  async function member(brandSlug, handle, start = null, archived = null, options = {}) {
    await db.query(`INSERT INTO managed_creators
      (tenant_id,creator_id,brand,reporting_start_date,archived_at,account_1,account_2,account_10)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      options.tenant ?? tenant, options.creatorId ?? null, brandSlug, start, archived,
      handle, options.alias ?? null, options.tenth ?? null,
    ]);
  }
  async function sale(brandSlug, date, handle, amount, options = {}) {
    await db.query('INSERT INTO creator_performance VALUES ($1,$2,$3,$4,$5,$6)', [
      options.tenant ?? tenant, brandSlug, handle, date, options.period ?? 'daily', amount,
    ]);
  }
  async function monthRows(brandSlug, handle, amount, lastDay = 30, month = '2026-09') {
    await db.query(`INSERT INTO creator_performance
      SELECT $1,$2,$3,$4::date + i,'daily',$5::numeric
      FROM generate_series(0,$6::integer - 1) i`, [tenant, brandSlug, handle, `${month}-01`, amount, lastDay]);
  }
  async function snapshot(forTenant = tenant, month = '2026-09-01') {
    const { rows } = await db.query(`SELECT brand_id, managed_gmv, prior_managed_gmv,
      recorded_days, prior_recorded_days, expected_days, prior_expected_days,
      recorded_through::text, prior_recorded_through::text, complete, prior_complete
      FROM agency_business_month_performance($1,$2) ORDER BY brand_id`, [forTenant, month]);
    return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key, numericKeys.includes(key) && value !== null ? Number(value) : value,
    ])));
  }

  await brand(1, 'shared');
  await brand(2, 'umbrella');
  await brand(3, 'store-a', { parent: 2 });
  await brand(4, 'store-b', { parent: 2, archived: true });
  await brand(5, 'archived-client', { archived: true });
  await brand(6, 'true-zero');
  await brand(7, 'no-source');
  await brand(8, 'prior-only');
  await brand(9, 'current-only');
  await brand(12, 'unknown-money');
  await brand(14, 'orphan-child', { tenant: id(777), parent: 1 });

  // A full set of organic source rows establishes coverage independently of
  // whether managed sales exist. Extra creator rows must not add covered days.
  await monthRows('shared', 'organic', 4);
  await member('shared', '@ALICE', '2026-09-05', '2026-09-10T17:00:00Z', { creatorId: id(100), alias: 'alice' });
  await member('shared', 'Alice', '2026-09-07', '2026-09-10T17:00:00Z');
  await member('shared', 'alice', '2026-09-20', '2026-09-22T00:00:00Z');
  await member('shared', 'refund', null, null);
  await member('shared', null, null, null, { creatorId: id(101), tenth: '@TEN' });
  await member('shared', 'inverted', '2026-09-15', '2026-09-01T00:00:00Z');
  await member('shared', 'empty', '2026-09-05', '2026-09-05T00:00:00Z');
  await db.query(`INSERT INTO tiktok_accounts VALUES
    ($1,$2,'alice'),($1,$2,'@ALICE'),($1,$3,'linked')`, [tenant, id(100), id(101)]);
  for (const [day, amount] of [[4, 999], [5, 100], [9, 70], [10, 888], [15, 777], [20, 20], [21, 21], [22, 666]]) {
    await sale('shared', `2026-09-${String(day).padStart(2, '0')}`, '@alice', amount);
  }
  await sale('shared', '2026-09-09', 'refund', -7);
  await sale('shared', '2026-09-11', 'ten', 10);
  await sale('shared', '2026-09-11', '@LINKED', 12);
  await sale('shared', '2026-09-11', 'inverted', 999);
  await sale('shared', '2026-09-05', 'empty', 999);
  await sale('shared', '2026-08-31', 'refund', 13);
  await sale('shared', '2026-07-31', 'refund', 999);
  await sale('shared', '2026-10-01', 'refund', 999);
  await sale('shared', '2026-09-01', 'refund', 999, { period: 'monthly' });

  await member('umbrella', 'store-creator');
  await monthRows('store-a', 'store-creator', 1);
  await monthRows('store-b', 'store-creator', 1, 29);
  await sale('umbrella', '2026-09-30', 'store-creator', 11);
  await member('archived-client', 'former');
  await sale('archived-client', '2026-09-02', 'former', 95);
  await member('true-zero', 'managed-with-no-sales');
  await monthRows('true-zero', 'organic', 2);
  await sale('true-zero', '2026-09-03', 'organic-unknown', null);
  await member('prior-only', 'history');
  await monthRows('prior-only', 'history', 2, 31, '2026-08');
  await member('current-only', 'today');
  await sale('current-only', '2026-09-03', 'today', 0);
  await member('unknown-money', 'unknown');
  await monthRows('unknown-money', 'organic', 1);
  await sale('unknown-money', '2026-09-03', 'unknown', null);
  await sale('unknown-money', '2026-08-03', 'unknown', 8);

  // Run the deployed baseline against populated fixtures before installing the
  // replacement. The fast path must preserve money and coverage exactly,
  // including unknown organic money and a tenant without any root brands.
  const parityCases = [[tenant, '2026-09-01'], [tenant, '2026-10-01'], [tenant, '2024-03-01'], [id(777), '2026-09-01']];
  const baseline = [];
  for (const [forTenant, month] of parityCases) baseline.push(await snapshot(forTenant, month));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261004193328_agency_business_performance_fast_path.sql', import.meta.url), 'utf8'));
  for (const [index, [forTenant, month]] of parityCases.entries()) {
    assert.deepEqual(await snapshot(forTenant, month), baseline[index], `Optimized query preserves deployed semantics: ${forTenant}/${month}`);
  }

  const before = await snapshot();
  const rows = new Map(before.map(row => [row.brand_id, row]));
  assert.equal(before.length, 8, 'Only top-level clients appear, including archived clients and absent source');
  assert.deepEqual(rows.get(id(1)), {
    brand_id: id(1), managed_gmv: 226, prior_managed_gmv: 13,
    recorded_days: 30, prior_recorded_days: 1, expected_days: 30, prior_expected_days: 31,
    recorded_through: '2026-09-30', prior_recorded_through: '2026-08-31', complete: true, prior_complete: false,
  }, 'Membership start/archive boundaries, disjoint intervals, aliases, account 10, linked handles, refunds and date bounds');
  assert.deepEqual(rows.get(id(2)), {
    brand_id: id(2), managed_gmv: 70, prior_managed_gmv: null,
    recorded_days: 29, prior_recorded_days: 0, expected_days: 30, prior_expected_days: 31,
    recorded_through: '2026-09-29', prior_recorded_through: null, complete: false, prior_complete: false,
  }, 'Legacy root facts contribute once but cannot conceal a missing archived child-store day');
  assert.equal(rows.get(id(5)).managed_gmv, 95, 'Current registry archival cannot erase historical data');
  assert.equal(rows.get(id(6)).managed_gmv, 0, 'Complete source without managed sales remains a recorded zero even with unknown organic money');
  assert.equal(rows.get(id(6)).complete, true);
  assert.equal(rows.get(id(7)).managed_gmv, null);
  assert.equal(rows.get(id(7)).prior_managed_gmv, null);
  assert.equal(rows.get(id(7)).complete, false);
  assert.equal(rows.get(id(7)).recorded_through, null);
  assert.equal(rows.get(id(8)).managed_gmv, null, 'Prior data cannot fabricate a current zero');
  assert.equal(rows.get(id(8)).prior_managed_gmv, 62);
  assert.equal(rows.get(id(8)).prior_complete, true);
  assert.equal(rows.get(id(9)).managed_gmv, 0, 'Explicit zero source remains zero despite incomplete month');
  assert.equal(rows.get(id(9)).prior_managed_gmv, null, 'Current data cannot fabricate a prior zero');
  assert.equal(rows.get(id(12)).managed_gmv, null, 'A managed source row with unknown money cannot establish a zero');
  assert.equal(rows.get(id(12)).complete, true, 'Source-presence coverage does not establish monetary completeness');
  assert.equal(rows.get(id(12)).prior_managed_gmv, 8, 'Unknown current money does not erase known prior money');

  // Overlapping tenant IDs, slugs, creator IDs and handles challenge every join.
  await brand(10, 'shared', { tenant: foreignTenant });
  await brand(11, 'foreign-store', { tenant: foreignTenant, parent: 2 });
  await member('shared', 'organic', null, null, { tenant: foreignTenant, creatorId: id(101) });
  await member('shared', 'alice', null, null, { tenant: foreignTenant });
  await db.query('INSERT INTO tiktok_accounts VALUES ($1,$2,$3)', [foreignTenant, id(101), 'foreign-link']);
  await sale('shared', '2026-09-09', 'foreign-link', 800);
  await sale('shared', '2026-09-09', 'alice', 50000, { tenant: foreignTenant });
  await sale('store-b', '2026-09-30', 'store-creator', 50000, { tenant: foreignTenant });
  assert.deepEqual(await snapshot(), before, 'Foreign roster/accounts/facts/registry rows cannot alter this tenant');
  assert.equal((await snapshot(foreignTenant))[0].managed_gmv, 50000);
  assert.deepEqual(await snapshot(id(999)), [], 'An unknown tenant never widens to unscoped data');
  assert.deepEqual(await snapshot(id(777)), [], 'A tenant with child rows but no owned roots has no agency performance rows');

  // Coverage is a set intersection, not max(store day count) or a total across
  // stores. Fill the single missing source day to complete the umbrella month.
  await sale('store-b', '2026-09-30', 'organic', 0);
  const completedUmbrella = (await snapshot()).find(row => row.brand_id === id(2));
  assert.equal(completedUmbrella.managed_gmv, 70);
  assert.equal(completedUmbrella.recorded_days, 30);
  assert.equal(completedUmbrella.complete, true);

  const leap = (await snapshot(tenant, '2024-03-01'))[0];
  assert.equal(leap.expected_days, 31);
  assert.equal(leap.prior_expected_days, 29, 'Prior month respects leap years');
  for (const month of [null, '2026-09-02', '1999-12-01', '2101-01-01', 'infinity', '-infinity']) {
    await assert.rejects(snapshot(tenant, month), error => error.code === '22023', `Reject invalid month ${month}`);
  }
  await assert.rejects(snapshot(null), error => error.code === '22023', 'Reject missing tenant');

  const security = (await db.query(`SELECT prosecdef, provolatile, proconfig,
    has_function_privilege('anon',oid,'EXECUTE') AS anon,
    has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated,
    has_function_privilege('service_role',oid,'EXECUTE') AS service
    FROM pg_proc WHERE oid='public.agency_business_month_performance(uuid,date)'::regprocedure`)).rows[0];
  assert.equal(security.prosecdef, false);
  assert.equal(security.provolatile, 's');
  assert.equal(security.anon, false);
  assert.equal(security.authenticated, false);
  assert.equal(security.service, true);
  assert.ok(security.proconfig.includes('search_path=pg_catalog, public, pg_temp'));
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(snapshot(), error => error.code === '42501');
    await db.exec('RESET ROLE');
  }
  // The calling service has SELECT only. A read-only transaction proves this
  // endpoint requires neither cost-ledger permissions nor renewal side effects.
  const expected = await snapshot();
  await db.exec('SET ROLE service_role; BEGIN READ ONLY');
  assert.deepEqual(await snapshot(), expected);
  assert.deepEqual(await snapshot(), expected);
  await db.exec('ROLLBACK; RESET ROLE');
  console.log('PASS agency performance: membership dates, interval union, all account sources, refunds and two-month bounds');
  console.log('PASS fast-path parity with deployed original: absent sources, zeros, unknown managed/organic money and empty roots');
  console.log('PASS independent missing/zero months, archived clients, full-store daily coverage and leap-year calendar');
  console.log('PASS tenant isolation across every source; service-only invoker executes in a read-only transaction');
} finally {
  await db.close();
}
