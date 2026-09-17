import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";
const own = {
  userId: "manager-a",
  tenantId: "tenant-a",
  permissions: new Set(["reporting:read", "reporting:write"]),
  brandScope: { kind: "all" },
};
let scope = own,
  calls = [];
const tables = {
  brands_v2: [
    {
      id: "a",
      slug: "a",
      tenant_id: "tenant-a",
      is_archived: false,
      parent_brand_id: null,
    },
    {
      id: "b",
      slug: "b",
      tenant_id: "tenant-a",
      is_archived: false,
      parent_brand_id: null,
    },
    {
      id: "foreign",
      slug: "a",
      tenant_id: "tenant-b",
      is_archived: false,
      parent_brand_id: null,
    },
  ],
  brand_manager_assignments: [
    { brand_id: "a", manager_user_id: "manager-a" },
    { brand_id: "b", manager_user_id: "manager-b" },
    { brand_id: "foreign", manager_user_id: "manager-a" },
  ],
};
function from(table) {
  const filters = [];
  const q = {
    select: () => q,
    eq: (k, v) => {
      filters.push((r) => r[k] === v);
      return q;
    },
    in: (k, v) => {
      filters.push((r) => v.includes(r[k]));
      return q;
    },
    then: (ok, fail) =>
      Promise.resolve({
        data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))),
        error: null,
      }).then(ok, fail),
  };
  return q;
}
const admin = {
  from,
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { error: null };
  },
};
const deps = {
  "server-only": {},
  "next/server": { NextRequest, NextResponse },
  "@/lib/supabase/server": {
    createClient: async () => admin,
    createAdminClient: async () => admin,
  },
  "@/lib/auth/workspace-scope": {
    getWorkspaceScope: async () => scope,
    isBrandInScope: (s, b) =>
      s.brandScope.kind === "all" || s.brandScope.brandIds.includes(b.id),
  },
  "@/lib/auth/platform-admin": {
    getActiveTenantId: async () => null,
    assertNotImpersonating: async () => {},
  },
  "./dashboard-series": { getDashboardSeries: async () => null },
};
function load(file) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      console,
      Set,
      Map,
      Date,
      require: (name) => {
        assert.ok(name in deps, name);
        return deps[name];
      },
    },
  );
  return exports;
}
deps["@/lib/auth/permissions"] = load("src/lib/auth/permissions.ts");
const model = load("src/lib/data/manager-goals-model.ts");
deps["./manager-goals-model"] = model;
deps["@/lib/data/manager-goals-model"] = model;
const data = load("src/lib/data/manager-goals.ts");
deps["@/lib/data/manager-goals"] = data;
const route = load("src/app/api/manager-goals/route.ts");
const input = {
  brandId: "a",
  month: "2026-08",
  action: "propose",
  target: 10000,
  reason: "Growth plan",
  version: 0,
};
const save = (patch = {}) =>
  route.POST(
    new NextRequest("https://fixture.invalid/api/manager-goals", {
      method: "POST",
      body: JSON.stringify({ ...input, ...patch }),
    }),
  );
assert.deepEqual(
  Array.from((await data.goalContext()).brands, (b) => b.id),
  ["a"],
);
assert.equal((await save()).status, 200);
assert.equal(calls.length, 1);
assert.equal(calls[0].args.p_actor, "manager-a");
assert.equal(calls[0].args.p_tenant, "tenant-a");
for (const patch of [
  { brandId: "b" },
  { brandId: "foreign" },
  { action: "approve" },
])
  assert.equal((await save(patch)).status, 403);
for (const patch of [
  { month: 123 },
  { month: "2026-13" },
  { target: 0 },
  { target: 0.001 },
  { target: 12.345 },
  { reason: "" },
  { version: -1 },
])
  assert.equal((await save(patch)).status, 400);
for (const denied of [
  null,
  { ...own, permissions: new Set() },
  { ...own, impersonating: { userId: "x" } },
]) {
  scope = denied;
  assert.equal((await save()).status, 403);
}
assert.equal(calls.length, 1);
scope = {
  ...own,
  permissions: new Set(["reporting:read", "reporting:configure"]),
};
assert.deepEqual(
  Array.from((await data.goalContext()).brands, (b) => b.id),
  ["a", "b"],
);
assert.equal((await save({ brandId: "b", action: "approve" })).status, 200);
scope = { ...scope, brandScope: { kind: "scoped", brandIds: ["a"] } };
assert.equal((await save({ brandId: "b", action: "approve" })).status, 403);
assert.equal(calls.length, 2);
assert.equal(model.goalProgress(10, null), null);
assert.equal(model.goalProgress(null, 10), null);
const rows = [
  { brand_id: "a", stat_date: "2026-08-01", recorded: true },
  { brand_id: "a", stat_date: "2026-08-02", recorded: true },
];
assert.equal(model.goalCoverage(rows, ["a"], "2026-08-01", "2026-08-02"), true);
assert.equal(
  model.goalCoverage(rows, ["a"], "2026-08-01", "2026-08-03"),
  false,
);
assert.equal(
  model.goalCoverage(rows, ["a", "b"], "2026-08-01", "2026-08-02"),
  false,
);
assert.equal(
  model.goalCoverage([rows[0], rows[0]], ["a"], "2026-08-01", "2026-08-02"),
  false,
);
console.log(
  "PASS goal API: own proposals, leadership approval, scoped reach, foreign brand denial, impersonation denial, strict inputs, missing/duplicate coverage",
);

for (const [month, proposal, approval] of [
  ["2026-10", "2026-09-25", "2026-09-30"],
  ["2026-11", "2026-10-28", "2026-10-30"],
  ["2026-06", "2026-05-27", "2026-05-29"],
  ["2028-03", "2028-02-24", "2028-02-29"],
  ["2027-01", "2026-12-28", "2026-12-31"],
]) {
 const dates = model.goalDeadlines(month);
 assert.equal(dates.proposal, proposal);
 assert.equal(dates.approval, approval);
}
assert.throws(() => model.goalDeadlines("invalid"));
console.log("PASS monthly goal deadlines: weekdays, weekend month ends, leap February and year rollover");
