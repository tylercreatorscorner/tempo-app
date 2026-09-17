import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const db = new PGlite();
const id = "11111111-1111-4111-8111-111111111111",
  tenant = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
await db.exec(`create role anon;create role authenticated;create role service_role;
create table brands_v2(id uuid,slug text,tenant_id uuid);
create table brand_daily_stats(brand_id uuid,report_date date,gmv numeric,orders numeric,items_sold numeric);
create table creator_performance(tenant_id uuid,brand text,creator_name text,report_date date,period_type text,gmv numeric,orders numeric,items_sold numeric);
insert into brands_v2 values('${id}','alpha','${tenant}');
insert into brand_daily_stats values('${id}','2026-01-01',100,4,8),('${id}','2026-01-02',200,10,12);
insert into creator_performance values
('${tenant}','alpha','CaSe','2026-01-01','daily',40,2,3),
('${tenant}','alpha','case','2026-01-02','daily',60,3,4),
('${tenant}','alpha','unmanaged','2026-01-01','daily',60,2,5),
('${other}','alpha','case','2026-01-01','daily',999,99,99),
('${tenant}','alpha','case','2026-01-01','weekly',888,88,88);
grant select on all tables in schema public to service_role;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917052443_dashboard_metric_series.sql",
    "utf8",
  ),
);
const signature = "public.dashboard_metric_series(uuid[],date,date,jsonb)";
for (const role of ["anon", "authenticated"])
  assert.equal(
    (
      await db.query(
        `select has_function_privilege('${role}','${signature}','execute') allowed`,
      )
    ).rows[0].allowed,
    false,
  );
await db.exec("set role service_role");
const members = JSON.stringify([
  { brand: "alpha", handle: "case", cutoff: "2026-01-02" },
  { brand: "alpha", handle: "case", cutoff: "2026-01-02" },
]);
const result = (
  await db.query(
    `select * from dashboard_metric_series(array['${id}']::uuid[],'2026-01-01','2026-01-03','${members}') order by stat_date`,
  )
).rows;
assert.equal(result.length, 2);
assert.equal(Number(result[0].managed_gmv), 40);
assert.equal(Number(result[0].managed_orders), 2);
assert.equal(Number(result[0].managed_units), 3);
assert.equal(Number(result[1].managed_gmv), 0);
assert.equal(Number(result[1].gmv), 200);
assert.equal(
  (
    await db.query(
      `select * from dashboard_metric_series(array[]::uuid[],'2026-01-01','2026-01-03','${members}')`,
    )
  ).rows.length,
  0,
);
await db.close();
const model = {};
runInNewContext(
  ts.transpileModule(
    readFileSync("src/lib/data/dashboard-series-model.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: model },
);
const rows = result.map((r) => ({
  ...r,
  stat_date: new Date(r.stat_date).toISOString().slice(0, 10),
}));
const daily = model.seriesPoints(
  rows,
  "2026-01-01",
  "2026-01-03",
  "managed_orders",
);
assert.equal(daily[0].gmv, 2);
assert.equal(daily[1].gmv, 0);
assert.equal(daily[2].gmv, null);
const monthly = model.monthlyPoints(rows, "2026-01-01", "2026-02-28", 1);
assert.equal(monthly[0].total, 300);
assert.equal(monthly[0].managed, 40);
assert.equal(monthly[0].share, (40 / 300) * 100);
assert.equal(monthly[0].partial, true);
assert.equal(monthly[1].total, null);
console.log(
  "PASS chart series SQL and models: scoped tenants/stores, service-only, daily basis, cutoff, duplicate membership, order/unit distinction, zero versus gaps, monthly weighted share",
);

let scope = { brandScope: { kind: "scoped", brandSlugs: ["alpha"] } };
let rpcArgs = null,
  adminReads = 0;
const scopedExports = {};
const fakeBrands = [
  { id: "allowed", slug: "alpha", tenant_id: "t1", parent_brand_id: null },
  { id: "secret", slug: "beta", tenant_id: "t2", parent_brand_id: null },
];
const query = (rows) => ({
  select() {
    return this;
  },
  eq() {
    return this;
  },
  in() {
    return this;
  },
  then(resolve) {
    return Promise.resolve({ data: rows, error: null }).then(resolve);
  },
});
runInNewContext(
  ts.transpileModule(readFileSync("src/lib/data/dashboard-series.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: scopedExports,
    AbortSignal,
    require(path) {
      if (path === "server-only") return {};
      if (path.endsWith("/workspace-scope"))
        return {
          getWorkspaceScope: async () => scope,
          isBrandInScope: (s, b) => s.brandScope.brandSlugs.includes(b.slug),
        };
      if (path.endsWith("/platform-admin"))
        return { getActiveTenantId: async () => null };
      if (path.endsWith("/supabase/server"))
        return {
          createClient: async () => ({ from: () => query(fakeBrands) }),
          createAdminClient: async () => {
            adminReads++;
            return {
              from: () =>
                query([
                  ...fakeBrands,
                  { id: "collision", slug: "alpha", tenant_id: "t2" },
                ]),
              rpc: (_name, args) => {
                rpcArgs = args;
                return { abortSignal: async () => ({ data: [], error: null }) };
              },
            };
          },
        };
      if (path.endsWith("/brand-registry"))
        return {
          getBrandRegistry: async () => ({}),
          expandSlugs: (_reg, slug) => [slug],
        };
      if (path.endsWith("/managed-gmv"))
        return {
          buildManagedLookup: async () => ({
            managedLookup: new Set(["case|||alpha"]),
            archivedOn: new Map(),
          }),
        };
      throw Error(path);
    },
  },
);
await scopedExports.getDashboardSeries("2026-01-01", "2026-01-03", "alpha");
assert.equal(rpcArgs.p_brand_ids.join(","), "allowed");
assert.equal(rpcArgs.p_members[0].handle, "case");
rpcArgs = null;
adminReads = 0;
await scopedExports.getDashboardSeries("2026-01-01", "2026-01-03", "beta");
assert.equal(rpcArgs, null);
assert.equal(adminReads, 0);
scope = null;
assert.equal(
  await scopedExports.getDashboardSeries("2026-01-01", "2026-01-03"),
  null,
);
assert.equal(adminReads, 0);
console.log(
  "PASS series access: authenticated scope, requested-brand denial, no privileged read on denial, tenant-safe store expansion",
);
