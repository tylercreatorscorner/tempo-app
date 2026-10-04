import assert from "node:assert/strict";
import { validateClientSaveInput, selectMonthTerms, calculateServiceRevenue, summarizeClientRetention, summarizeTenureGrowth, type ClientRecord } from "../src/lib/agency/model";
const id = "00000000-0000-4000-8000-000000000001";
const draft = { expectedRevision: 0, name: " Client ", brandIds: [id], serviceStart: "2026-01-15", serviceEnd: null, exitReason: null, terms: [] };
const saved = validateClientSaveInput(draft);
assert.equal(saved.name, "Client");
assert.deepEqual(saved.terms, []);
for (const bad of [{ ...draft, tenantId: id }, { ...draft, serviceStart: "2026-02-30" }, { ...draft, serviceEnd: "2026-01-01", exitReason: "Ended" }, { ...draft, serviceEnd: "2026-01-31" }, { ...draft, brandIds: [id, id] }, { ...draft, expectedRevision: NaN }, { ...draft, terms: [{ effectiveMonth: "2026-01", feeModel: "fixed" }] }]) assert.throws(() => validateClientSaveInput(bad));
const term = { effectiveMonth: "2026-01", monthlyRetainer: 0, revSharePercent: 0, feeModel: "fixed" as const };
assert.equal(validateClientSaveInput({ ...draft, terms: [term] }).terms[0].monthlyRetainer, 0);
for (const override of [{ monthlyRetainer: NaN }, { monthlyRetainer: Infinity }, { monthlyRetainer: -1 }, { monthlyRetainer: 1.001 }, { monthlyRetainer: 0.000000001 }, { revSharePercent: 100.01 }, { effectiveMonth: "2026-13" }, { unexpected: true }]) assert.throws(() => validateClientSaveInput({ ...draft, terms: [{ ...term, ...override }] }));
assert.throws(() => validateClientSaveInput({ ...draft, terms: [term, term] }));
const later = { ...term, effectiveMonth: "2026-09", monthlyRetainer: 999 };
assert.equal(selectMonthTerms([later, term], "2026-08"), term);
assert.equal(selectMonthTerms([later], "2026-08"), null);
const client: ClientRecord = { ...saved, id, revision: 1, updatedAt: null };
const revenue = (patch: Partial<ClientRecord> = {}, rest = {}) => calculateServiceRevenue({ client: { ...client, ...patch }, month: "2026-08", periodStart: "2026-08-01", periodEnd: "2026-08-31", gmvCents: 100, gmvComplete: true, ...rest });
assert.equal(revenue().status, "needs_setup");
assert.equal(revenue({ terms: [term] }).revenueCents, 0);
assert.equal(revenue({ terms: [term], serviceStart: null }).status, "needs_lifecycle");
assert.equal(revenue({ terms: [term], serviceStart: "2026-08-15" }).status, "review_required");
assert.equal(revenue({ terms: [term], serviceEnd: "2026-08-20" }).status, "review_required");
assert.equal(revenue({ terms: [term] }, { periodEnd: "2026-08-30" }).status, "review_required");
assert.equal(revenue({ terms: [term], serviceEnd: "2026-07-31" }).status, "outside_service");
assert.equal(revenue({ terms: [{ ...term, feeModel: "share", revSharePercent: 0.5 }] }).revenueCents, 1);
assert.equal(revenue({ terms: [{ ...term, feeModel: "share", revSharePercent: 10 }] }, { gmvComplete: false }).status, "missing_gmv");
assert.equal(revenue({ terms: [{ ...term, feeModel: "share", revSharePercent: 10 }] }, { gmvCents: 0 }).revenueCents, 0);
assert.equal(revenue({ terms: [{ ...term, feeModel: "share", revSharePercent: 10 }] }, { gmvCents: -100 }).status, "review_required");
assert.equal(revenue({ terms: [{ ...term, feeModel: "minimum", monthlyRetainer: 100, revSharePercent: 10 }] }).revenueCents, 10000);
assert.equal(revenue({ terms: [{ ...term, feeModel: "additive", monthlyRetainer: 100, revSharePercent: 10 }] }).revenueCents, 10010);
const clients = [client, { ...client, id: "exit", serviceEnd: "2026-08-31", exitReason: "End of service" }, { ...client, id: "earlier", serviceEnd: "2026-07-31" }, { ...client, id: "new", serviceStart: "2026-08-01" }, { ...client, id: "unknown", serviceStart: null }];
const retention = summarizeClientRetention(clients, "2026-08");
assert.deepEqual([retention.opening, retention.retained, retention.churned, retention.newClients, retention.missingLifecycle, retention.retentionRate], [2, 1, 1, 1, 1, 0.5]);
assert.equal(retention.cohorts[0].tenureMonths, 7);
assert.equal(retention.churnRate, 0.5);
assert.equal(retention.exitedClients, 1);
const sameMonthExit = summarizeClientRetention([...clients, { ...client, id: "short-lived", serviceStart: "2026-08-02", serviceEnd: "2026-08-20", exitReason: "Service ended" }], "2026-08");
assert.equal(sameMonthExit.exitedClients, 2);
assert.equal(sameMonthExit.newClients, 2);
assert.equal(sameMonthExit.churned, 1); // New entrants are excluded from the opening-cohort denominator.
assert.equal(sameMonthExit.retentionRate, 0.5);
assert.equal(summarizeClientRetention([client], "2026-01").retentionRate, null);
assert.equal(summarizeClientRetention([client], "2026-08").retained, 1); // No GMV input: zero selling activity cannot imply churn.
const growthClients = [
  { ...client, id: "early", serviceStart: "2026-06-01" },
  { ...client, id: "new", serviceStart: "2026-08-01" },
  { ...client, id: "partial", serviceStart: "2026-07-02" },
  { ...client, id: "middle", serviceStart: "2026-04-01" },
  { ...client, id: "established", serviceStart: "2026-01-01" },
  { ...client, id: "long", serviceStart: "2025-08-01" },
  { ...client, id: "unknown", serviceStart: null },
];
const known = { currentGmvCents: 200, priorGmvCents: 100, currentComplete: true, priorComplete: true };
const perf = Object.fromEntries(growthClients.map(row => [row.id, known]));
const growth = summarizeTenureGrowth(growthClients, "2026-08", perf);
assert.equal(growth.missingLifecycle, 1);
assert.deepEqual(growth.cohorts.map(row => row.key), ["1-3", "4-6", "7-12", "13+"]);
assert.deepEqual(growth.cohorts.map(row => row.clientCount), [3, 1, 1, 1]);
assert.deepEqual(growth.cohorts.map(row => row.comparableCount), [1, 1, 1, 1]);
assert.equal(growth.cohorts[0].nonComparableCount, 2); // Neither new nor partly pre-service months borrow a baseline.
assert.equal(growth.cohorts[0].growthRate, 1);
const incomplete = summarizeTenureGrowth(growthClients, "2026-08", { ...perf, early: { ...known, priorComplete: false } });
assert.equal(incomplete.cohorts[0].currentGmvCents, null);
assert.equal(incomplete.cohorts[0].growthRate, null);
assert.equal(incomplete.cohorts[0].missingDataCount, 1);
const zeroBase = summarizeTenureGrowth(growthClients, "2026-08", { ...perf, long: { ...known, priorGmvCents: 0 } });
assert.equal(zeroBase.cohorts[3].growthRate, null);
assert.equal(zeroBase.cohorts[3].currentGmvCents, 200);
const refunds = summarizeTenureGrowth(growthClients, "2026-08", { ...perf, established: { ...known, currentGmvCents: -100 } });
assert.equal(refunds.cohorts[2].reviewCount, 1);
assert.equal(refunds.cohorts[2].growthRate, null);
console.log("PASS agency business model: strict validation, effective terms, exact cents, zero vs unconfigured, incomplete months, lifecycle retention");
