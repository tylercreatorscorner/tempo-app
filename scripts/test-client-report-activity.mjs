import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the exported generator, with all data access unavailable: drafting
// commentary must describe the supplied snapshot and cannot rewrite history.
const exports = {};
const dependencies = new Set([
  './reporting-exclusions', '@/lib/supabase/server',
  '@/lib/data/published-video-evidence', '@/lib/data/brand-registry',
  '@/lib/data/brand-client-report',
]);
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/client-reports.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, Date, Number,
  require(name) {
    assert.ok(dependencies.has(name), 'Unexpected dependency: ' + name);
    return new Proxy({}, { get: () => () => { throw new Error('Drafting notes must not access a data source'); } });
  },
});
const make = (count, days = 8) => ({
  report: {
    periodLengthDays: days, gmvChangePct: 36, priorTotalGmv: 129066,
    creatorsCorner: {
      gmv: 40663.81, gmvChangePct: 70, priorGmv: 23903.81,
      pctOfStoreGmv: 23.2, videoChangePct: -4.3, videos: 288,
      newlyActivatedCount: count,
    },
  },
  // Seven people started selling versus thirteen becoming active; publishing
  // without a sale is also activation, and neither metric proves lifetime firsts.
  movers: { gained: 18729.18, lost: -1969.18, started: 7, stopped: 5, list: [] },
});
const snapshot = make(13);
const before = JSON.stringify(snapshot);
const notes = exports.draftClientReportNotes(snapshot);
assert.ok(notes.includes('13 managed creators posted or made sales this period after being inactive in the prior comparison period.'));
assert.ok(!/first sale|first time/i.test(notes), 'Comparison-window activity cannot imply a lifetime first');
assert.equal(JSON.stringify(snapshot), before, 'Drafting new notes must not alter the supplied snapshot');
assert.ok(exports.draftClientReportNotes(make(1, 7)).includes('1 managed creator posted or made sales this week after being inactive in the prior comparison period.'));
assert.ok(!exports.draftClientReportNotes(make(0)).includes('inactive'), 'Zero activations must not invent new activity');
const postsChanged = make(13); postsChanged.report.creatorsCorner.videoChangePct = 20;
assert.ok(!exports.draftClientReportNotes(postsChanged).includes('inactive'), 'The existing single closing-signal choice is preserved');
console.log('PASS client report activity: real note generator describes comparison-window activity, preserves snapshot, and does not claim first-ever sales');
