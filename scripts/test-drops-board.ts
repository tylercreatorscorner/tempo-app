import assert from 'node:assert/strict';
import { loadDropBoard, parseDropSelection, type DropBoardCard } from '../src/lib/data/drop-board-client';
import { DROP_FORMATS } from '../src/lib/data/drop-formats';

async function main() {
const originalFetch = globalThis.fetch;
const tick = () => new Promise(resolve => setImmediate(resolve));
const pending: Array<{ id: string; resolve: (r: Response) => void }> = [];
const seen: string[] = [];
let active = 0, peak = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input), 'https://fixture.invalid');
  const id = url.searchParams.get('format')!;
  assert.equal(url.searchParams.get('brand'), 'fixture');
  assert.equal(url.searchParams.get('start'), '2026-09-14');
  seen.push(id);
  active++; peak = Math.max(peak, active);
  return new Promise<Response>((resolve, reject) => {
    pending.push({ id, resolve: r => { active--; resolve(r); } });
    init?.signal?.addEventListener('abort', () => { active--; reject(new Error('Aborted')); }, { once: true });
  });
};
const cards: DropBoardCard[] = [];
const params = new URLSearchParams({ brand: 'fixture', period: 'custom', start: '2026-09-14', end: '2026-09-20' });
const run = loadDropBoard(params, new AbortController().signal, card => cards.push(card));
await tick();
assert.equal(pending.length, 3, 'Database fan-out is bounded to three formats');
const fast = pending.shift()!;
fast.resolve(Response.json({ cards: [{ id: fast.id, text: 'Ready', error: null }] }));
await tick();
assert.equal(cards.length, 1, 'A completed card appears while other formats are still pending');
assert.equal(seen.length, 4, 'Finishing a format starts the next queued format');
const slow = pending.shift()!;
slow.resolve(new Response('FUNCTION_INVOCATION_TIMEOUT', { status: 504 }));
await tick();
assert.equal(cards[1].id, slow.id);
assert.equal(cards[1].empty, false, 'Timeout must not look like an empty format');
assert.match(cards[1].error!, /took too long/);
while (cards.length < DROP_FORMATS.length) {
  const p = pending.shift()!;
  p.resolve(Response.json({ cards: [{ id: p.id, text: 'Ready', error: null }] }));
  await tick();
}
await run;
assert.equal(cards.filter(c => c.text).length, 6);
assert.equal(new Set(seen).size, 7);
assert.equal(peak, 3);
const controller = new AbortController();
let staleUpdates = 0;
const canceled = loadDropBoard(params, controller.signal, () => staleUpdates++);
controller.abort();
await canceled;
assert.equal(staleUpdates, 0, 'Changing selection/unmounting must not restore the old board');
assert.equal(seen.length, 10, 'Cancellation does not start queued formats');
pending.length = 0; seen.length = 0; active = 0;
const started: string[] = [];
const picked: DropBoardCard[] = [];
const selectedRun = loadDropBoard(params, new AbortController().signal, card => picked.push(card), {
  formats: ['daily-drop', 'movers', 'movers'], onStart: id => started.push(id),
});
assert.deepEqual(seen, ['movers', 'daily-drop'], 'Only selected formats run, once each, in board order');
assert.deepEqual(started, seen, 'Loading status starts only when the request actually starts');
for (const p of pending.splice(0)) p.resolve(Response.json({ cards: [{ id: p.id, text: 'Ready', error: null }] }));
await selectedRun;
assert.equal(picked.length, 2);
seen.length = 0;
await loadDropBoard(params, new AbortController().signal, () => assert.fail('No cards requested'), { formats: [] });
assert.equal(seen.length, 0, 'Empty selection does not silently fall back to every format');
assert.deepEqual(parseDropSelection(null), DROP_FORMATS.map(f => f.id));
assert.deepEqual(parseDropSelection('broken'), DROP_FORMATS.map(f => f.id));
assert.deepEqual(parseDropSelection('["removed-format"]'), DROP_FORMATS.map(f => f.id));
assert.deepEqual(parseDropSelection('[]'), []);
assert.deepEqual(parseDropSelection('["movers","unknown","movers","daily-drop"]'), ['movers', 'daily-drop']);
globalThis.fetch = originalFetch;
console.log('PASS incremental board: bounded concurrency, completed cards survive 504, and cancellation suppresses stale results');
console.log('PASS format selection: selected-only requests, accurate start events, no empty-selection requests and resilient saved preferences');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
