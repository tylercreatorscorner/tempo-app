import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE tenants(id uuid PRIMARY KEY);
CREATE TABLE brands_v2(id uuid PRIMARY KEY,tenant_id uuid,is_archived boolean);
CREATE TABLE user_profiles(user_id uuid PRIMARY KEY,tenant_id uuid);
CREATE TABLE brand_manager_assignments(brand_id uuid,manager_user_id uuid);
INSERT INTO tenants VALUES('${id(1)}'),('${id(2)}');
INSERT INTO brands_v2 VALUES('${id(10)}','${id(1)}',false),('${id(11)}','${id(2)}',false);
INSERT INTO user_profiles VALUES('${id(20)}','${id(1)}'),('${id(21)}','${id(2)}');
INSERT INTO brand_manager_assignments VALUES('${id(10)}','${id(20)}'),('${id(11)}','${id(21)}');
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917220113_manager_monthly_goals.sql",
    "utf8",
  ),
);
const save = (
  action,
  target,
  version,
  brand = id(10),
  manager = id(20),
  month = "2026-08-01",
) =>
  db.query("select save_manager_monthly_goal($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    id(1),
    brand,
    manager,
    month,
    id(20),
    action,
    target,
    "Confirmed growth plan",
    version,
  ]);
await db.exec("SET ROLE authenticated");
await assert.rejects(save("approve", 100, 0), /permission denied/);
await assert.rejects(
  db.query("select * from manager_monthly_goals"),
  /permission denied/,
);
await db.exec("RESET ROLE; SET ROLE service_role");
await assert.rejects(
  save("approve", 100, 0, id(11), id(21)),
  /assignment changed/,
);
await assert.rejects(
  save("approve", 100, 0, id(10), id(21)),
  /assignment changed/,
);
await assert.rejects(
  save("approve", 100, 0, id(10), id(20), "2026-08-02"),
  /Invalid goal/,
);
for (const value of [0, -1, 0.001, 123.456])
  await assert.rejects(save("propose", value, 0), /Invalid goal/);
await save("propose", 10000, 0);
await save("approve", 12000, 1);
await save("propose", 15000, 2);
const goal = async () =>
  (await db.query("select * from manager_monthly_goals")).rows[0];
assert.equal(Number((await goal()).approved_target), 12000);
assert.equal(Number((await goal()).proposed_target), 15000);
await assert.rejects(save("approve", 20000, 2), /Goal changed/);
assert.equal(
  (await db.query("select count(*)::int as n from manager_goal_events")).rows[0]
    .n,
  3,
);
await assert.rejects(
  db.query("delete from manager_goal_events"),
  /permission denied/,
);
await assert.rejects(
  db.query("update manager_goal_events set reason='rewrite'"),
  /permission denied/,
);
await db.exec(
  `RESET ROLE; CREATE FUNCTION reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture event failure'; END $$; CREATE TRIGGER reject_event BEFORE INSERT ON manager_goal_events FOR EACH ROW EXECUTE FUNCTION reject_event(); SET ROLE service_role;`,
);
await assert.rejects(save("approve", 18000, 3), /fixture event failure/);
assert.equal(Number((await goal()).approved_target), 12000);
assert.equal((await goal()).version, 3);
await db.exec(
  `RESET ROLE; DROP TRIGGER reject_event ON manager_goal_events; UPDATE brand_manager_assignments SET manager_user_id='${id(21)}' WHERE brand_id='${id(10)}'; SET ROLE service_role;`,
);
await assert.rejects(save("approve", 18000, 3), /assignment changed/);
console.log(
  "PASS goal RPC: tenant/assignment isolation, client denial, proposal separation, optimistic concurrency, immutable history, transactional rollback",
);
await db.close();
