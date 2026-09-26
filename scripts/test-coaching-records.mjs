import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create table tenants(id uuid primary key);
create table brands_v2(id uuid primary key,tenant_id uuid,is_archived boolean);
create table user_profiles(user_id uuid primary key,tenant_id uuid,role text,role_id uuid);
create table roles(id uuid primary key,tenant_id uuid,key text);
create table role_permissions(role_id uuid,screen text,level text);
create table user_brand_access(user_id uuid,tenant_id uuid,brand_id uuid);
insert into tenants values('${id(1)}'),('${id(2)}');
insert into brands_v2 values('${id(10)}','${id(1)}',false),('${id(11)}','${id(2)}',false);
insert into auth.users values('${id(20)}'),('${id(21)}'),('${id(22)}'),('${id(23)}');
insert into user_profiles values('${id(20)}','${id(1)}','owner',null),('${id(21)}','${id(1)}','coach',null),('${id(22)}','${id(1)}','manager',null),('${id(23)}','${id(2)}','coach',null);
insert into roles values('${id(30)}','${id(1)}','owner'),('${id(31)}','${id(1)}','coach'),('${id(32)}','${id(1)}','manager');
insert into role_permissions values('${id(30)}','reporting','read'),('${id(31)}','reporting','read'),('${id(32)}','reporting','read');
insert into role_permissions values('${id(30)}','reporting','configure'),('${id(30)}','reporting','write'),('${id(31)}','reporting','write'),('${id(32)}','reporting','write');
insert into user_brand_access values('${id(21)}','${id(1)}','${id(10)}'),('${id(22)}','${id(1)}','${id(10)}');
grant usage on schema public,auth to service_role;
grant select on all tables in schema public,auth to service_role;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260926205305_coaching_weekly_records.sql",
    "utf8",
  ),
);
await db.exec(readFileSync('supabase/migrations/20260926211327_coaching_permission_levels.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260926223936_coaching_sunday_weeks.sql','utf8'));
const call = (
  actor,
  action,
  assignment = null,
  payload = {},
  expected = 0,
  tenant = id(1),
  week = "2026-09-20",
) =>
  db.query("select write_coaching_record($1,$2,$3,$4,$5,$6,$7) as id", [
    actor,
    tenant,
    action,
    assignment,
    week,
    payload,
    expected,
  ]);
const assignmentPayload = {
  brandId: id(10),
  coachId: id(21),
  reviewerId: id(22),
};
await db.exec("set role authenticated");
await assert.rejects(
  call(id(20), "assign", null, assignmentPayload),
  /permission denied/,
);
await assert.rejects(
  db.query("select * from coaching_submissions"),
  /permission denied/,
);
await db.exec("reset role;set role service_role");
await assert.rejects(
  call(id(21), "assign", null, assignmentPayload),
  /access denied/,
);
await assert.rejects(
  call(id(20), "assign", null, { ...assignmentPayload, brandId: id(11) }),
  /Invalid coaching assignment/,
);
await assert.rejects(
  call(id(20), "assign", null, { ...assignmentPayload, coachId: id(23) }),
  /need brand access/,
);
const assignment = (await call(id(20), "assign", null, assignmentPayload))
  .rows[0].id;
const draft = {
  entries: {
    feedback: { done: true, evidence: "Reviewed opening hooks" },
    calls: { done: true, evidence: "Call recap" },
    loom: { done: true, evidence: "https://www.loom.com/share/example" },
  },
  summary: "Coaching complete",
  blockers: "",
};
await assert.rejects(
  call(id(22), "save", assignment, draft),
  /Only the assigned coach/,
);
await assert.rejects(
  call(id(21), "save", assignment, draft, 0, id(2)),
  /access denied/,
);
await assert.rejects(
  call(id(21), "save", assignment, draft, 0, id(1), "2026-09-22"),
  /valid week/,
);
await call(id(21), "save", assignment, draft);
await assert.rejects(
  call(id(21), "submit", assignment, draft),
  /Report changed/,
);
await assert.rejects(
  call(id(21), "submit", assignment, { ...draft, summary: "" }, 1),
  /weekly summary/,
);
await assert.rejects(
  call(
    id(21),
    "submit",
    assignment,
    {
      ...draft,
      entries: { ...draft.entries, loom: { done: false, evidence: "" } },
    },
    1,
  ),
  /Explain unfinished/,
);
await call(id(21), "submit", assignment, draft, 1);
await assert.rejects(call(id(21), "save", assignment, draft, 2), /read-only/);
await assert.rejects(
  call(id(21), "reviewed", assignment, { note: "" }, 2),
  /Only the assigned reviewer/,
);
await assert.rejects(
  call(id(22), "changes_requested", assignment, { note: "" }, 2),
  /Explain the requested/,
);
await call(
  id(22),
  "changes_requested",
  assignment,
  { note: "Add creator names" },
  2,
);
await call(
  id(21),
  "submit",
  assignment,
  { ...draft, summary: "Updated with creator names" },
  3,
);
await call(id(22), "reviewed", assignment, { note: "Reviewed" }, 4);
const submissions = (
  await db.query("select * from coaching_submissions order by revision")
).rows;
assert.equal(submissions.length, 2);
assert.equal(submissions[0].content.summary, "Coaching complete");
assert.equal(submissions[1].content.summary, "Updated with creator names");
assert.equal((await db.query("select * from coaching_reviews")).rows.length, 2);
await assert.rejects(
  db.query("update coaching_submissions set content='{}'"),
  /permission denied/,
);
await assert.rejects(
  db.query("delete from coaching_reviews"),
  /permission denied/,
);
await db.exec(
  `reset role;delete from user_brand_access where user_id='${id(21)}';set role service_role`,
);
await assert.rejects(
  call(id(21), "save", assignment, draft, 0, id(1), "2026-09-13"),
  /Brand access denied/,
);
// Historical week is independent; revoked brand access is evaluated on every write.
await db.exec(
  `reset role;insert into user_brand_access values('${id(21)}','${id(1)}','${id(10)}');set role service_role`,
);
await call(id(21), "submit", assignment, draft, 0, id(1), "2026-09-13");
assert.equal(
  (await db.query("select * from coaching_submissions")).rows.length,
  3,
);
// A failed history insert must roll back its report draft/version too.
await db.exec(`reset role;create function reject_coaching_submission() returns trigger language plpgsql as $$ begin raise exception 'fixture history failure'; end; $$;create trigger reject_coaching_submission before insert on coaching_submissions for each row execute function reject_coaching_submission();set role service_role;`);
await assert.rejects(call(id(21),'submit',assignment,draft,0,id(1),'2026-09-06'),/fixture history failure/);
assert.equal((await db.query("select * from coaching_weekly_reports where week_start='2026-09-06'")).rows.length,0);
await db.exec(`reset role;drop trigger reject_coaching_submission on coaching_submissions;delete from role_permissions where role_id='${id(31)}';set role service_role;`);
await assert.rejects(call(id(21),'save',assignment,draft,0,id(1),'2026-09-06'),/Coaching access denied/);
console.log(
  "PASS coaching records: role/tenant/brand isolation, coach identity, stale writes, submission validation, immutable revisions, review permissions and prior weeks",
);
await db.close();
