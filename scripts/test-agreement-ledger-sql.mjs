import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table tenants(id uuid primary key);create table creators_v2(id uuid primary key,tenant_id uuid);
create table brands_v2(id uuid primary key,tenant_id uuid,is_archived boolean);
create table creator_brands(creator_id uuid,brand_id uuid,tenant_id uuid);
insert into tenants values('${id(1)}'),('${id(2)}');
insert into creators_v2 values('${id(3)}','${id(1)}'),('${id(4)}','${id(2)}');
insert into brands_v2 values('${id(5)}','${id(1)}',false),('${id(6)}','${id(2)}',false);
insert into creator_brands values('${id(3)}','${id(5)}','${id(1)}');
grant usage on schema public to service_role;grant select on all tables in schema public to service_role;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260918010833_creator_agreement_ledger.sql",
    "utf8",
  ),
);
const state = {
  schemaVersion: 1,
  start: "2026-10-01",
  finalDate: null,
  deadline: null,
  kind: "monthly",
  periods: [
    {
      start: "2026-10-01",
      through: "2026-10-31",
      revisions: [{ version: 1, segments: [] }],
    },
  ],
};
const command = { action: "create", reason: "Verified sample agreement" };
const save = (
  version = 0,
  request = 10,
  cmd = command,
  s = state,
  ledger = 7,
  tenant = 1,
  creator = 3,
  brand = 5,
) =>
  db.query(
    "select save_creator_agreement_ledger($1,$2,$3,$4,$5,$6,$7,$8,$9) as version",
    [
      id(ledger),
      id(tenant),
      id(creator),
      id(brand),
      id(8),
      version,
      id(request),
      JSON.stringify(cmd),
      JSON.stringify(s),
    ],
  );
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(save(), /permission denied/);
  await assert.rejects(
    db.query("select * from creator_agreement_ledgers"),
    /permission denied/,
  );
  await db.exec("reset role");
}
await db.exec("set role service_role");
await assert.rejects(save(0, 10, command, state, 7, 1, 4, 6), /relationship/);
assert.equal((await save()).rows[0].version, 1);
assert.equal((await save()).rows[0].version, 1); // network retry is idempotent
await assert.rejects(
  save(0, 10, { ...command, reason: "Different payload" }),
  /Request key/,
);
await assert.rejects(
  save(0, 11, { action: "change", reason: "Stale edit" }),
  /changed/,
);
await assert.rejects(save(0, 12, command, state, 9), /overlaps/);
await assert.rejects(
  save(
    1,
    16,
    { action: "change", reason: "Erase history" },
    { ...state, periods: [] },
  ),
  /Invalid agreement write/,
);
await assert.rejects(
  save(
    1,
    17,
    { action: "change", reason: "Overwrite history" },
    {
      ...state,
      periods: [
        {
          ...state.periods[0],
          revisions: [{ version: 1, segments: ["replacement"] }],
        },
      ],
    },
  ),
  /cannot be replaced/,
);
assert.equal(
  (await save(1, 13, { action: "change", reason: "October correction" }))
    .rows[0].version,
  2,
);
await assert.rejects(
  db.query("delete from creator_agreement_events"),
  /permission denied/,
);
await assert.rejects(
  db.query("update creator_agreement_events set version=100"),
  /permission denied/,
);
await save(
  2,
  14,
  { action: "end", reason: "Ends in October" },
  { ...state, finalDate: "2026-10-31" },
);
await save(0, 15, command, { ...state, start: "2026-11-01" }, 9);
assert.equal(
  (await db.query("select count(*)::int as n from creator_agreement_events"))
    .rows[0].n,
  4,
);
await db.exec("reset role");
await assert.rejects(
  db.query("delete from creator_agreement_events"),
  /append-only/,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from pg_class where relname in ('creator_agreement_ledgers','creator_agreement_events') and relrowsecurity",
    )
  ).rows[0].n,
  2,
);
await db.close();
console.log(
  "Agreement SQL: scope, overlap, concurrency, idempotency, immutable audit and client denial passed.",
);
