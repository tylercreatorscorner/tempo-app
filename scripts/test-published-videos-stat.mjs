import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const api = {};
const jsx = (type, props) => ({ type, props });
runInNewContext(ts.transpileModule(readFileSync('src/components/dashboard/published-videos-stat.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: api,
  require: name => {
    if (name === 'server-only') return {};
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'next/link') return { default: 'link' };
    if (name.endsWith('/stat-card')) return { StatCard: 'stat-card' };
    if (name.endsWith('/utils/trend')) return { pctChange: (current, prior) => (current - prior) / prior * 100 };
    throw new Error(name);
  },
});
const fixture = { total: 8, priorTotal: 4, currentComplete: true, priorComplete: true, brands: [] };
const render = (counts, canReviewUploads = false) => api.PublishedVideosStat({ counts: Promise.resolve(counts), canReviewUploads });
let resolve;
const deferred = new Promise(done => { resolve = done; });
let finished = false;
const pending = api.PublishedVideosStat({ counts: deferred, canReviewUploads: false }).then(result => { finished = true; return result; });
await Promise.resolve();
assert.equal(finished, false, 'Only the isolated video card awaits the deferred count');
resolve(fixture);
let card = await pending;
assert.equal(card.props.value, '8');
assert.equal(card.props.trend, 100);
assert.equal(card.props.trendLabel, '4 more vs prior period');
assert.equal(card.props.detail, 'Recorded managed videos');
for (const flag of ['currentComplete', 'priorComplete']) {
  card = await render({ ...fixture, [flag]: false });
  assert.equal(card.props.trend, undefined, 'Incomplete video coverage withholds percentage changes');
  assert.equal(card.props.trendLabel, undefined);
}
card = await render({ ...fixture, total: 3, priorTotal: 0 });
assert.equal(card.props.trend, undefined, 'Zero prior does not fabricate a percentage');
assert.equal(card.props.trendLabel, '3 more vs prior period');
card = await render({ ...fixture, total: 0 });
assert.equal(card.props.value, '0', 'A recorded zero remains distinct from a failed read');
assert.equal(card.props.trend, -100);
card = await render(null);
assert.equal(card.props.value, '—');
assert.equal(JSON.stringify(card).includes('Check coverage'), false, 'Restricted users are not offered an admin-only destination');
card = await render(null, true);
assert.equal(JSON.stringify(card).includes('"href":"/upload"'), true);
assert.equal(JSON.stringify(card).includes('Video total unavailable'), true);
console.log('PASS streamed video KPI: deferred count, recorded totals, coverage gating, zero prior, unavailable reads and admin-only repair action');
