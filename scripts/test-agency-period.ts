import assert from 'node:assert/strict';
import { agencyPeriod } from '../src/lib/data/agency-period';

const september = agencyPeriod('2026-09-01', '2026-09-29', 'mtd');
assert.equal(september.priorStart, '2026-08-01');
assert.equal(september.priorEnd, '2026-08-29');
assert.equal(september.periodLabel, 'September 1–29, 2026 · month to date');
assert.equal(september.priorLabel, 'August 1–29, 2026');
assert.equal(september.shorterPrior, false);

const march = agencyPeriod('2027-03-01', '2027-03-31', 'mtd');
assert.equal(march.priorStart, '2027-02-01');
assert.equal(march.priorEnd, '2027-02-28');
assert.equal(march.shorterPrior, true);

const january = agencyPeriod('2027-01-01', '2027-01-07', 'mtd');
assert.equal(january.priorStart, '2026-12-01');
assert.equal(january.priorEnd, '2026-12-07');

const complete = agencyPeriod('2026-08-01', '2026-08-31', 'complete-month');
assert.equal(complete.priorStart, '2026-07-01');
assert.equal(complete.priorEnd, '2026-07-31');
assert.equal(complete.periodLabel, 'August 2026');

console.log('PASS agency period: MTD, short prior month, year boundary, existing completed-month comparison');
