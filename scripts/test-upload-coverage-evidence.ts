import assert from 'node:assert/strict';
import { coverageLabel, coverageCountEvidence, type CellState } from '../src/components/upload/coverage-types';
import { classifyCell, type RunFacts } from '../src/lib/data/upload-coverage';

const completeFile: CellState = {
  status: 'partial', rows: 399, expectedRows: 399, fileRows: 399, runStatus: 'complete',
  source: 'upload', confirmed: false,
};
assert.equal(coverageLabel(completeFile), 'Review coverage');
const evidence = coverageCountEvidence(completeFile, 15856);
assert.equal(evidence.label, 'Rows in parsed file');
assert.equal(evidence.progress, '100% of parsed file rows saved');
assert.equal(evidence.uploadComplete, true);
assert.equal(coverageLabel({ ...completeFile, confirmed: true }), 'Partial');
assert.equal(coverageLabel({ ...completeFile, confirmed: undefined }), 'Partial');
assert.equal(coverageLabel({ ...completeFile, runStatus: 'failed' }), 'Partial');
assert.equal(coverageLabel({ ...completeFile, runStatus: 'running' }), 'Partial');
assert.equal(coverageLabel({ ...completeFile, rows: 100 }), 'Partial');
assert.equal(coverageCountEvidence({ ...completeFile, rows: 100 }, 15856).uploadComplete, false);
assert.equal(coverageCountEvidence({ ...completeFile, fileRows: null, expectedRows: null }, null).pct, null);
assert.equal(coverageCountEvidence({ ...completeFile, fileRows: null, expectedRows: 16592 }, 15856).uploadComplete, false);
assert.equal(coverageCountEvidence({ ...completeFile, fileRows: null, expectedRows: 16592 }, 15856).label, 'Baseline row count');
assert.equal(coverageCountEvidence({ ...completeFile, runStatus: 'failed' }, 15856).uploadComplete, false);
const legacy = coverageCountEvidence({ status: 'partial', rows: 399, expectedRows: 16592 }, 15856);
assert.equal(legacy.label, 'Baseline row count');
assert.equal(legacy.progress, '2% of baseline row count');
assert.equal(legacy.uploadComplete, false);
const run: RunFacts = { status: 'complete', source: 'upload', rowsWritten: 399, rowsExpected: 399,
  error: null, startedAt: '2026-10-14T17:00:00Z', finishedAt: '2026-10-14T17:01:00Z' };
const classified = classifyCell({ date: '2026-10-11', rows: 399, trailingMedian: 16592,
  leadingMedian: null, run, judgeThrough: '2026-10-11' });
assert.equal(classified.fileRows, 399);
assert.equal(coverageLabel(classified), 'Review coverage');
assert.equal(coverageCountEvidence(classified, 15856).uploadComplete, true);
const failed = classifyCell({ date: '2026-10-11', rows: 100, trailingMedian: 16592,
  leadingMedian: null, run: { ...run, status: 'failed', rowsWritten: 100 }, judgeThrough: '2026-10-11' });
assert.equal(failed.confirmed, true);
assert.equal(coverageLabel(failed), 'Partial');
console.log('PASS coverage evidence: parsed-file completion differs from baseline warnings; confirmed failures retained; unknown counts never guessed');
