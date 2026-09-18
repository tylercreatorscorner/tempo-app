import assert from "node:assert/strict";
import {
  applyAgreementCommand as apply,
  agreementPeriodSnapshot as capture,
  validAgreementDate,
} from "../src/lib/agreements/model";
import type { AgreementTerms } from "../src/lib/agreements/model";
const terms: AgreementTerms = {
  feeCents: 100000,
  requiredPosts: 20,
  renewal: "automatic",
  payment: "prorated_posts",
  priorPeriodCredits: "approval_required",
};
const actor = { id: "test-owner", now: "2026-10-05T12:00:00Z" };
const initial = apply(
  null,
  {
    action: "create",
    kind: "monthly",
    start: "2026-09-01",
    deadline: null,
    terms,
    reason: "Verified agreement",
  },
  actor,
);
const october = apply(
  initial,
  { action: "advance", through: "2026-10-05", reason: "Automatic renewal" },
  actor,
);
assert.equal(october.periods.length, 2);
assert.equal(initial.periods.length, 1);
assert.deepEqual(
  apply(
    october,
    { action: "advance", through: "2026-10-05", reason: "Retry renewal" },
    actor,
  ),
  october,
);
const sent = capture(october, "2026-10-01");
const changed = apply(
  october,
  {
    action: "change",
    effective: "2026-10-01",
    scope: "period",
    terms: { ...terms, feeCents: 120000, requiredPosts: 24 },
    reason: "October exception",
  },
  actor,
);
assert.equal(
  capture(changed, "2026-10-01")!.segments[0].terms.feeCents,
  120000,
);
assert.equal(sent!.segments[0].terms.feeCents, 100000);
assert.equal(changed.periods[0].revisions.length, 1);
assert.equal(changed.periods[1].revisions.length, 2);
const november = apply(
  changed,
  { action: "advance", through: "2026-11-01", reason: "Monthly renewal" },
  { ...actor, now: "2026-11-01T12:00:00Z" },
);
assert.equal(
  capture(november, "2026-11-01")!.segments[0].terms.feeCents,
  100000,
);
const split = apply(
  october,
  {
    action: "change",
    effective: "2026-10-05",
    scope: "future",
    terms: { ...terms, feeCents: 150000 },
    reason: "New terms from fifth",
  },
  actor,
);
const snap = capture(split, "2026-10-01")!;
assert.equal(snap.segments.length, 2);
assert.equal(snap.segments[0].through, "2026-10-04");
assert.equal(snap.segments[1].from, "2026-10-05");
assert.equal(snap.paymentReviewRequired, true);
const future = apply(
  split,
  { action: "advance", through: "2026-11-01", reason: "Monthly renewal" },
  { ...actor, now: "2026-11-01T12:00:00Z" },
);
assert.equal(capture(future, "2026-11-01")!.segments[0].terms.feeCents, 150000);
const ended = apply(
  future,
  { action: "end", finalDate: "2026-10-20", reason: "Partnership ended" },
  actor,
);
assert.equal(capture(ended, "2026-11-01")!.cancelled, true);
assert.equal(
  capture(ended, "2026-10-01")!.segments.at(-1)!.through,
  "2026-10-20",
);
assert.equal(
  apply(
    ended,
    { action: "advance", through: "2026-12-01", reason: "Scheduled renewal" },
    { ...actor, now: "2026-12-01T12:00:00Z" },
  ).periods.length,
  3,
);
const manual = apply(
  null,
  {
    action: "create",
    kind: "monthly",
    start: "2026-09-01",
    deadline: null,
    terms: { ...terms, renewal: "manual" },
    reason: "Manual renewal",
  },
  actor,
);
assert.equal(
  apply(
    manual,
    { action: "advance", through: "2026-10-05", reason: "Automatic run" },
    actor,
  ).periods.length,
  1,
);
assert.equal(
  apply(
    manual,
    { action: "renew", through: "2026-10-05", reason: "Explicit renewal" },
    actor,
  ).periods.length,
  2,
);
const december = apply(
  null,
  {
    action: "create",
    kind: "monthly",
    start: "2027-12-01",
    deadline: null,
    terms,
    reason: "Verified agreement",
  },
  actor,
);
assert.equal(
  apply(
    december,
    { action: "advance", through: "2028-02-01", reason: "Catch up renewal" },
    { ...actor, now: "2028-02-01T12:00:00Z" },
  ).periods.at(-1)!.through,
  "2028-02-29",
);
assert.equal(validAgreementDate("2026-02-30"), false);
assert.throws(
  () =>
    apply(
      october,
      {
        action: "change",
        effective: "2026-08-01",
        scope: "period",
        terms,
        reason: "Invalid date",
      },
      actor,
    ),
  /outside/,
);
assert.throws(
  () =>
    apply(
      october,
      {
        action: "change",
        effective: "2026-10-01",
        scope: "period",
        terms: { ...terms, feeCents: 1.5 },
        reason: "Invalid cents",
      },
      actor,
    ),
  /Invalid agreement terms/,
);
assert.throws(
  () =>
    apply(
      october,
      { action: "end", finalDate: "2026-10-31", reason: "" },
      actor,
    ),
  /reason/,
);
const campaign = apply(
  null,
  {
    action: "create",
    kind: "campaign",
    start: "2026-10-01",
    deadline: "2026-10-15",
    terms: { ...terms, renewal: "manual" },
    reason: "Fixed campaign",
  },
  actor,
);
assert.equal(campaign.periods[0].through, "2026-10-15");
assert.throws(
  () =>
    apply(
      campaign,
      { action: "advance", through: "2026-10-05", reason: "Wrong renewal" },
      actor,
    ),
  /cannot renew/,
);
console.log(
  "Agreement lifecycle: renewal, exceptions, effective-date splits, end, leap year, immutable snapshots and validation passed.",
);
const extended = apply(
  null,
  {
    action: "create",
    kind: "monthly",
    start: "2026-07-24",
    firstPeriodEnd: "2026-08-31",
    deadline: null,
    terms,
    reason: "Confirmed opening period",
  },
  actor,
);
assert.equal(extended.periods.length, 1);
assert.equal(extended.periods[0].through, "2026-08-31");
assert.equal(
  capture(extended, "2026-07-24")!.segments[0].terms.feeCents,
  100000,
);
assert.equal(
  apply(
    extended,
    { action: "advance", through: "2026-08-31", reason: "No early renewal" },
    actor,
  ).periods.length,
  1,
);
const september = apply(
  extended,
  { action: "advance", through: "2026-09-01", reason: "First monthly renewal" },
  actor,
);
assert.equal(september.periods.length, 2);
assert.equal(september.periods[1].start, "2026-09-01");
assert.equal(september.periods[1].through, "2026-09-30");
const openingException = apply(
  extended,
  {
    action: "change",
    effective: "2026-07-24",
    scope: "period",
    terms: { ...terms, feeCents: 120000 },
    reason: "Opening period exception",
  },
  actor,
);
assert.equal(capture(openingException, "2026-07-24")!.segments.length, 1);
assert.equal(
  capture(openingException, "2026-07-24")!.segments[0].through,
  "2026-08-31",
);
assert.equal(
  capture(
    apply(
      openingException,
      {
        action: "advance",
        through: "2026-09-01",
        reason: "Renew original terms",
      },
      actor,
    ),
    "2026-09-01",
  )!.segments[0].terms.feeCents,
  100000,
);
assert.throws(
  () =>
    apply(
      null,
      {
        action: "create",
        kind: "monthly",
        start: "2026-07-24",
        firstPeriodEnd: "2026-07-01",
        deadline: null,
        terms,
        reason: "Invalid opening period",
      },
      actor,
    ),
  /First period/,
);
console.log(
  "Custom opening period: one July–August obligation, September renewal and period-only exception passed.",
);

assert.throws(()=>apply(manual,{action:'change',effective:'2026-11-01',scope:'future',terms,reason:'Future auto renewal'},actor),/Renew the missing period first/);
console.log('Manual renewal gaps cannot silently strand future automatic terms.');
